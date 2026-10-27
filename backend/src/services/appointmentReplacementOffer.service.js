import pool from '../config/database.js';
import Appointment from '../models/Appointment.model.js';
import Client from '../models/Client.model.js';
import { cancellationFollowUp, slotKey, replacementFormats, selectReplacementFormat, replacementSlotLabel } from './cancellationFollowUp.service.js';
import { withProviderSelectionLock, assertNoSelectionConflict } from './publicProviderHold.service.js';
import { withClientSchedulingLock, assertClientNotTerminated } from './clientSchedulingGuard.service.js';
import { assertAppointmentWindowAvailable } from './appointmentConflict.service.js';
import { requireStaffCareEligibility } from './staffCareEligibility.service.js';
import { maybeEncryptNotePayload, maybeDecryptNotePayload } from './clinicalNoteCrypto.service.js';
import { parseUtcDate } from '../utils/officeEventDateTime.util.js';
import { readPrivateReplacementSlots, invalidateReplacementAvailability } from './privateReplacementSlots.service.js';

const fail = (message, status = 409) => Object.assign(new Error(message), { status });
const sqlDate = value => new Date(value).toISOString().slice(0, 19).replace('T', ' ');
const canceled = a => ['canceled_by_provider', 'canceled_by_client', 'canceled_by_guardian', 'canceled_by_organization', 'late_canceled', 'rescheduled'].includes(a?.status);

/** Individual, expiring permission. This never enables a provider's public booking. */
export function createReplacementOfferService(overrides = {}) {
  const deps = { database: pool, appointments: Appointment, clients: Client, followUp: cancellationFollowUp,
    now: () => new Date(), encrypt: maybeEncryptNotePayload, decrypt: maybeDecryptNotePayload,
    providerLock: withProviderSelectionLock, clientLock: withClientSchedulingLock,
    checkWindow: assertAppointmentWindowAvailable, checkSelection: assertNoSelectionConflict,
    recordEvent: async (...args) => (await import('./replacementOfferEvents.service.js')).replacementOfferEvents.record(...args),
    finalizeBooking: async (...args) => (await import('./replacementBookingConfirmation.service.js')).finalizeReplacementBooking(...args),
    eligible: requireStaffCareEligibility, invalidate: invalidateReplacementAvailability, ...overrides };
  const db = deps.database;
  const decode = row => JSON.parse(deps.decrypt(typeof row.slots_json === 'string' ? row.slots_json : JSON.stringify(row.slots_json)));
  async function get(appointmentId, clientId, connection = db) {
    const [[row]] = await connection.execute('SELECT * FROM appointment_replacement_offers WHERE appointment_id=? AND client_id=?', [appointmentId, clientId]);
    return row || null;
  }
  async function requireAppointment(appointmentId, clientId) {
    const a = await deps.appointments.findById(appointmentId);
    const ids = [...new Set((a ? await deps.appointments.listParticipants(a.id) : []).map(p => Number(p.clientId)).filter(Boolean))];
    if (!a || !canceled(a) || ids.length !== 1 || ids[0] !== Number(clientId)) throw fail('This replacement offer is no longer available. Contact your care team.');
    return a;
  }
  async function ensure(appointment, clientId, facts, actorUserId) {
    return deps.providerLock(db, appointment.providerUserId, async conn => {
      const existing = await get(appointment.id, clientId, conn);
      if (existing) return existing;
      await requireAppointment(appointment.id, clientId);
      const slots = await deps.followUp.validateOffer(appointment, facts);
      const expires = new Date(Math.min(+deps.now() + Number(facts.offerDays ?? 2) * 86400000,
        Math.max(...slots.map(s => +new Date(s.startAt)))));
      await conn.beginTransaction();
      try {
        const [offer] = await conn.execute(`INSERT INTO appointment_replacement_offers
          (appointment_id,agency_id,provider_id,client_id,mode,slots_json,expires_at,created_by_user_id) VALUES (?,?,?,?,?,?,?,?)`,
        [appointment.id, appointment.agencyId, appointment.providerUserId, clientId, facts.followUpAction,
          deps.encrypt(JSON.stringify(slots)), sqlDate(expires), actorUserId]);
        for (const slot of slots) {
          await conn.execute(`INSERT INTO appointment_replacement_slots (agency_id,provider_id,start_at,end_at,modality,room_id,slot_json)
            VALUES (?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE released_at=NULL,released_by_user_id=NULL,slot_json=VALUES(slot_json)`,
          [appointment.agencyId, appointment.providerUserId, sqlDate(slot.startAt), sqlDate(slot.endAt), slot.modality, slot.roomId || 0, deps.encrypt(JSON.stringify(slot))]);
          const [[saved]] = await conn.execute(`SELECT id FROM appointment_replacement_slots WHERE agency_id=? AND provider_id=? AND start_at=? AND end_at=? AND modality=? AND room_id=?`,
            [appointment.agencyId, appointment.providerUserId, sqlDate(slot.startAt), sqlDate(slot.endAt), slot.modality, slot.roomId || 0]);
          await conn.execute('INSERT INTO appointment_replacement_offer_slots (offer_id,slot_id) VALUES (?,?)', [offer.insertId, saved.id]);
        }
        await deps.invalidate(conn, appointment.providerUserId);
        await conn.commit();
      } catch (e) { await conn.rollback(); throw e; }
      return get(appointment.id, clientId, conn);
    });
  }
  async function availableOfferSlots(row, a, connection = db) {
    const [links] = await connection.execute(`SELECT s.id,s.slot_json FROM appointment_replacement_offer_slots os
      JOIN appointment_replacement_slots s ON s.id=os.slot_id
      WHERE os.offer_id=? AND os.released_at IS NULL AND s.released_at IS NULL`, [row.id]);
    const offered = new Map(links.map(s => [slotKey(JSON.parse(deps.decrypt(typeof s.slot_json === 'string' ? s.slot_json : JSON.stringify(s.slot_json)))), Number(s.id)]));
    const candidates = links.map(s => JSON.parse(deps.decrypt(typeof s.slot_json === 'string' ? s.slot_json : JSON.stringify(s.slot_json))));
    let available = await deps.followUp.validatePrivateSlots(a, candidates, { skipUnavailable: true });
    if (row.mode === 'portal_booking') {
      const published = await deps.followUp.slots(a);
      available = available.map(s => ({ ...s, availableFormats: (s.availableFormats || replacementFormats(s)).filter(format =>
        published.some(p => p.startAt === s.startAt && p.endAt === s.endAt && replacementFormats(p).includes(format)
          && (format === 'VIRTUAL' || Number(p.roomId) === Number(s.roomId)))) })).filter(s => s.availableFormats.length);
    }
    return available.map(s => ({ ...s, label: replacementSlotLabel(s), poolSlotId: offered.get(slotKey(s)) }));
  }
  async function view(appointmentId, clientId, userId = null) {
    const row = await get(appointmentId, clientId);
    if (!row) return null;
    const a = await requireAppointment(appointmentId, clientId);
    if (userId) await db.execute(`INSERT INTO appointment_replacement_offer_views (offer_id,user_id) VALUES (?,?)
      ON DUPLICATE KEY UPDATE last_viewed_at=UTC_TIMESTAMP()`, [row.id, userId]);
    const next = await deps.followUp.nextAppointment(a, clientId);
    const status = row.status === 'open' && parseUtcDate(row.expires_at) <= deps.now() ? 'expired' : row.status;
    let slots = [];
    if (status === 'open') {
      const allowed = row.mode !== 'portal_booking' || await deps.followUp.bookingEnabled(a);
      if (allowed) {
        slots = await availableOfferSlots(row, a);
      }
    }
    return { status: row.linked_appointment_id ? 'confirmed' : status === 'requested' ? 'booking' : status, expiresAt: parseUtcDate(row.expires_at).toISOString(), nextAppointment: next, slots, requestId: row.request_id || null };
  }
  async function respond({ appointmentId, clientId, userId, action, selectedKey, selectedModality }) {
    if (!['select', 'decline'].includes(action)) throw fail('Choose a replacement time or decline the offer.', 400);
    // Both recipients of a shared portal record operate on one offer. The provider
    // lock also serializes competing clients and regular staff bookings.
    return deps.clientLock([clientId], async () => {
      const a = await requireAppointment(appointmentId, clientId);
      await deps.eligible(a.providerUserId, a.agencyId);
      assertClientNotTerminated(await deps.clients.findById(clientId));
      const selection = await deps.providerLock(db, a.providerUserId, async conn => {
        const row = await get(appointmentId, clientId, conn);
        if (!row || Number(row.agency_id) !== Number(a.agencyId)) throw fail('Offer not found.', 404);
        if (row.status !== 'open') return { status: row.status, requestId: row.request_id || null, ...(row.linked_appointment_id ? { appointmentId:row.linked_appointment_id } : {}) };
        if (parseUtcDate(row.expires_at) <= deps.now()) throw fail('This offer expired. Your other appointments remain scheduled; contact support for help.');
        let slot;
        if (action === 'select') {
          if (row.mode === 'portal_booking' && !await deps.followUp.bookingEnabled(a)) throw fail('Online booking is no longer enabled. Please contact support.');
          const keys = new Set(decode(row).map(slotKey));
          if (!keys.has(selectedKey)) throw fail('Choose one of the times offered to you.', 400);
          slot = (await availableOfferSlots(row, a, conn)).find(s => slotKey(s) === selectedKey);
          if (!slot || +new Date(slot.startAt) <= +deps.now()) throw fail('That time is no longer available. Choose another offered time or keep your next appointment.');
          slot = selectReplacementFormat(slot, selectedModality);
          await deps.checkWindow(conn, { providerUserId: a.providerUserId, status: 'scheduled',
            startAt: sqlDate(slot.startAt), endAt: sqlDate(slot.endAt), sourceTimezone: slot.timeZone, replacementOfferId: row.id, officeEventId: slot.officeEventId || null });
          await deps.checkSelection(conn, { agencyId: a.agencyId, providerId: a.providerUserId, startAt: slot.startAt, endAt: slot.endAt, replacementOfferId: row.id });
          const [busy] = await conn.execute(`SELECT a.id FROM appointments a JOIN appointment_participants p ON p.appointment_id=a.id AND p.client_id=?
            WHERE a.start_at<? AND a.end_at>? AND a.status IN ('scheduled','confirmed','client_confirmed','checked_in') LIMIT 1`, [clientId, sqlDate(slot.endAt), sqlDate(slot.startAt)]);
          const [pending] = await conn.execute(`SELECT id FROM public_appointment_requests WHERE matched_client_id=?
            AND requested_start_at<? AND requested_end_at>? AND status IN ('PENDING','PENDING_EVAL','APPROVED') LIMIT 1`, [clientId, sqlDate(slot.endAt), sqlDate(slot.startAt)]);
          if (busy.length || pending.length) throw fail('You already have an appointment or pending request at this time.');
        }
        await conn.beginTransaction();
        try {
          let requestId = null;
          if (slot) {
            const [[contact]] = await conn.execute('SELECT first_name,last_name,email FROM users WHERE id=?', [userId]);
            const [[client]] = await conn.execute('SELECT full_name,initials FROM clients WHERE id=? AND agency_id=?', [clientId, a.agencyId]);
            if (!contact?.email || !client) throw fail('The care team needs a current contact email before confirming a replacement.');
            const [result] = await conn.execute(`INSERT INTO public_appointment_requests
              (agency_id,provider_id,modality,booking_mode,program_type,requested_start_at,requested_end_at,client_name,client_email,client_initials,matched_client_id,notes,status)
              VALUES (?,?,?,'CURRENT_CLIENT',?,?,?,?,?,?,?,?,'PENDING')`,
            [a.agencyId, a.providerUserId, slot.modality, slot.modality, sqlDate(slot.startAt), sqlDate(slot.endAt),
              client.full_name || client.initials || 'Current client', contact.email, client.initials || null, clientId,
              `Private replacement for appointment #${appointmentId}. One occurrence only.${slot.roomId ? ` Requested room #${slot.roomId} (${slot.roomLabel || 'office'}).` : ''} Keep all other appointments.`]);
            requestId = result.insertId;
          }
          await conn.execute(`UPDATE appointment_replacement_offers SET status=?,request_id=?,selected_slot_id=?,responded_by_user_id=?,responded_at=UTC_TIMESTAMP() WHERE id=? AND status='open'`,
            [slot ? 'requested' : 'declined', requestId, slot?.poolSlotId || null, userId, row.id]);
          const body = slot ? 'The client selected a provider-committed replacement time. Automatic booking is in progress.'
            : 'The client declined the replacement offer. Other scheduled appointments remain unchanged.';
          if (!slot) await conn.execute(`INSERT INTO notifications (type,severity,title,message,user_id,agency_id,related_entity_type,related_entity_id,actor_user_id,actor_source)
            VALUES ('public_appointment_request_received','info',?,?,?, ?,?,?,?,'guardian_portal')`,
            [slot ? 'Replacement time selected' : 'Replacement offer declined', body, a.providerUserId, a.agencyId,
              slot ? 'public_appointment_request' : 'appointment', requestId || appointmentId, userId]);
          // Session and client-file copies commit atomically with the selection.
          const metadata = deps.encrypt(JSON.stringify({ clientId, body, replacementOfferId: row.id, requestId, selectedSlot: slot || null, deliveryStatus: 'recorded' }));
          await conn.execute(`INSERT INTO appointment_communications (appointment_id,agency_id,direction,channel,kind,body_preview,metadata_json,created_by_user_id)
            VALUES (?,?,'inbound','in_app','cancellation','Private replacement response',?,?)`, [appointmentId, a.agencyId, metadata, userId]);
          await conn.execute(`INSERT INTO user_communications (agency_id,client_id,user_id,template_type,channel,subject,body,delivery_status,generated_by_user_id)
            VALUES (?,?,?,'session_cancellation','in_app','Private replacement response',?,'sent',?)`,
            [a.agencyId, clientId, userId, deps.encrypt(body), userId]);
          if (!slot) await deps.recordEvent(row, 'declined', conn);
          await deps.invalidate(conn, a.providerUserId);
          await conn.commit();
          return { status: slot ? 'requested' : 'declined', requestId };
        } catch (e) { await conn.rollback(); throw e; }
      });
      // The provisional hold commits first, then releases the provider lock.
      // Booking takes that same lock internally; nesting it would deadlock.
      if (['requested','confirmed'].includes(selection.status) && selection.requestId) {
        try {
          const booked = await decideRequest({ agencyId:a.agencyId, requestId:selection.requestId, status:'APPROVED', actorUserId:userId });
          return { status:'confirmed', requestId:selection.requestId, appointmentId:booked.appointmentId };
        } catch (e) {
          // A durable selection survives an interruption. The worker and repeat
          // submissions resume it; no provider approval is required.
          if (selection.status === 'confirmed') return selection;
          return { status:'booking', requestId:selection.requestId };
        }
      }
      return selection;
    });
  }
  async function releaseSlot(slotId, actorUserId) {
    const [[slot]] = await db.execute('SELECT * FROM appointment_replacement_slots WHERE id=?', [slotId]);
    if (!slot) throw fail('Offered time not found.', 404);
    return deps.providerLock(db, slot.provider_id, async conn => {
      const [selected] = await conn.execute(`SELECT r.id FROM appointment_replacement_offers o JOIN public_appointment_requests r ON r.id=o.request_id
        WHERE o.selected_slot_id=? AND r.status IN ('PENDING','PENDING_EVAL','APPROVED')`, [slotId]);
      if (selected.length) throw fail('A client already selected this time. Make any changes through the booked appointment in My Schedule.');
      await conn.beginTransaction();
      try {
        await conn.execute('UPDATE appointment_replacement_slots SET released_at=UTC_TIMESTAMP(),released_by_user_id=? WHERE id=?', [actorUserId, slotId]);
        await conn.execute('UPDATE appointment_replacement_offer_slots SET released_at=UTC_TIMESTAMP(),released_by_user_id=? WHERE slot_id=? AND released_at IS NULL', [actorUserId, slotId]);
        await deps.invalidate(conn, slot.provider_id); await conn.commit();
        return { released: true };
      } catch (e) { await conn.rollback(); throw e; }
    });
  }
  async function decideRequest({ agencyId, requestId, status, actorUserId }) {
    const [[offer]] = await db.execute('SELECT * FROM appointment_replacement_offers WHERE agency_id=? AND request_id=?', [agencyId, requestId]);
    if (!offer) return null;
    if (status !== 'APPROVED') throw fail('An offered time is a committed booking. Make any changes through the appointment in My Schedule; it cannot be denied as a request.');
    return deps.clientLock([offer.client_id], async () => {
      const conn = await db.getConnection(); let locked = false;
      try {
        const [[lock]] = await conn.execute('SELECT GET_LOCK(?,5) AS acquired', [`replacement-approval:${offer.id}`]);
        if (Number(lock?.acquired) !== 1) throw fail('This replacement is being booked. Please retry.');
        locked = true;
        const [[current]] = await conn.execute('SELECT * FROM appointment_replacement_offers WHERE id=?', [offer.id]);
        if (current.linked_appointment_id) {
          await finalizeBooking(current,current.linked_appointment_id,actorUserId);
          return { ok: true, appointmentId: current.linked_appointment_id, alreadyConfirmed: true };
        }
        const [[request]] = await conn.execute('SELECT * FROM public_appointment_requests WHERE id=? AND agency_id=?', [requestId, agencyId]);
        if (request?.status !== 'PENDING') throw fail('This request was already reviewed.');
        let created = null;
        if (status === 'APPROVED') {
          const original = await requireAppointment(offer.appointment_id, offer.client_id);
          const [[poolSlot]] = await conn.execute('SELECT slot_json FROM appointment_replacement_slots WHERE id=? AND released_at IS NULL', [offer.selected_slot_id]);
          if (!poolSlot) throw fail('This offered time was released.');
          const offeredSlot = JSON.parse(deps.decrypt(typeof poolSlot.slot_json === 'string' ? poolSlot.slot_json : JSON.stringify(poolSlot.slot_json)));
          const choice = selectReplacementFormat(offeredSlot, request.modality);
          const source = `replacement_offer:${offer.id}`;
          const [[partial]] = await conn.execute('SELECT id FROM appointments WHERE agency_id=? AND source=?', [agencyId, source]);
          // A partial booking already occupies the time. Resume its remaining
          // setup without treating that same appointment as a new conflict.
          const fresh = partial ? [choice] : await deps.followUp.validatePrivateSlots(original, [choice], { excludePublicRequestId: requestId });
          const selected = fresh.find(s => slotKey(s) === slotKey(choice));
          if (!selected) throw fail('This time is no longer available. Contact the care team to resolve the reservation.');
          const { createAppointment } = await import('./appointment.service.js');
          const originalBilling = await deps.appointments.getBilling(original.id);
          const billing = originalBilling ? { ...originalBilling } : null;
          if (billing && +parseUtcDate(selected.endAt)-+parseUtcDate(selected.startAt) !== +parseUtcDate(original.endAt)-+parseUtcDate(original.startAt)) delete billing.amountCents;
          created = await createAppointment({ agencyId, providerUserId: original.providerUserId,
            tenantServiceId: original.tenantServiceId, serviceCode: original.serviceCode, addonServiceCodes: original.addonServiceCodes || [],
            startAt: selected.startAt, endAt: selected.endAt, modality: selected.modality, timeZone: selected.timeZone,
            officeLocationId: selected.buildingId, roomId: selected.roomId, source, replacementOfferId: offer.id, deferScheduleNotice: true, resumeReplacementAppointmentId:partial?.id || null,
            packageEntitlementId: original.packageEntitlementId || null, title: original.title,
            participants: await deps.appointments.listParticipants(original.id), billing,
            createdByUserId: actorUserId });
          // A replacement is one independent occurrence, never a new recurring plan.
          const ProviderScheduleEvent = (await import('../models/ProviderScheduleEvent.model.js')).default;
          const description = `Replacement offer ${offer.id}; appointment ${created.id}`;
          const [[existingEvent]] = await conn.execute(`SELECT id FROM provider_schedule_events
            WHERE agency_id=? AND provider_id=? AND kind='PERSONAL_EVENT' AND description=? AND start_at=? AND end_at=? LIMIT 1`,
          [agencyId,original.providerUserId,description,sqlDate(selected.startAt),sqlDate(selected.endAt)]);
          const event = created.providerScheduleEventId ? {id:created.providerScheduleEventId} : existingEvent || await ProviderScheduleEvent.create({ agencyId, providerId: original.providerUserId, kind: 'PERSONAL_EVENT',
            title: original.title || 'Client session', description, isPrivate: true, clientId: offer.client_id,
            startAt: sqlDate(selected.startAt), endAt: sqlDate(selected.endAt), eventTimezone: selected.timeZone,
            recurrenceSeriesId: null, createdByUserId: actorUserId, notifyParticipants: false });
          await deps.appointments.update(created.id, { providerScheduleEventId: event.id });
        }
        await conn.beginTransaction();
        try {
          await conn.execute('UPDATE public_appointment_requests SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?', [status, requestId]);
          await conn.execute('UPDATE appointment_replacement_offers SET status=?,linked_appointment_id=? WHERE id=?',
            [created ? 'confirmed' : 'declined_by_team', created?.id || null, offer.id]);
          await deps.recordEvent({ ...offer, linked_appointment_id: created?.id || null }, 'confirmed', conn);
          await conn.execute(`INSERT INTO notifications (type,severity,title,message,user_id,agency_id,related_entity_type,related_entity_id,actor_user_id,actor_source)
            VALUES ('public_appointment_request_received','info','Replacement appointment reserved',?,?,?,'appointment',?,?,'guardian_portal')`,
          ['A client or guardian reserved one of your offered times. The appointment is scheduled; no approval is needed. Open My Schedule to view it or make a schedule change.',offer.provider_id,agencyId,created.id,actorUserId]);
          await deps.invalidate(conn, offer.provider_id); await conn.commit();
        } catch (e) { await conn.rollback(); throw e; }
        if (created) await finalizeBooking(offer,created.id,actorUserId);
        return { ok: true, status, appointmentId: created?.id || null };
      } finally { try { if (locked) await conn.execute('SELECT RELEASE_LOCK(?)', [`replacement-approval:${offer.id}`]); } finally { conn.release(); } }
    });
  }
  async function finalizeBooking(offer, appointmentId, actorUserId) {
    try { await deps.finalizeBooking(offer,appointmentId,actorUserId); }
    catch (e) { console.warn('[replacement-offers] Booking saved; notification setup will retry:', appointmentId, e.message); }
  }
  async function processBookings({limit=20,agencyId=null}={}) {
    const size=Math.max(1,Math.min(100,Number(limit)||20));
    const [rows]=await db.execute(`SELECT o.* FROM appointment_replacement_offers o
      JOIN public_appointment_requests r ON r.id=o.request_id
      WHERE ((o.status='requested' AND r.status='PENDING')
        OR (o.status='confirmed' AND o.linked_appointment_id IS NOT NULL AND NOT EXISTS (
          SELECT 1 FROM appointment_schedule_notices n WHERE n.appointment_id=o.linked_appointment_id AND n.client_id=o.client_id AND n.event_type='created')))
      AND (? IS NULL OR o.agency_id=?)
      ORDER BY r.updated_at,o.id LIMIT ${size}`, [agencyId,agencyId]);
    let failed=0;
    for(const offer of rows) {
      await db.execute('UPDATE public_appointment_requests SET updated_at=CURRENT_TIMESTAMP WHERE id=? AND agency_id=?',[offer.request_id,offer.agency_id]);
      try { await decideRequest({agencyId:offer.agency_id,requestId:offer.request_id,status:'APPROVED',actorUserId:offer.responded_by_user_id || offer.created_by_user_id}); }
      catch(e) {
        failed++;
        await db.execute(`INSERT INTO notifications (type,severity,title,message,user_id,agency_id,related_entity_type,related_entity_id,actor_source)
          SELECT 'public_appointment_request_received','warning','Replacement booking needs attention',?,?,?,'public_appointment_request',?,'system'
          WHERE NOT EXISTS (SELECT 1 FROM notifications WHERE related_entity_type='public_appointment_request' AND related_entity_id=? AND title='Replacement booking needs attention')`,
        ['Automatic booking could not finish. This client’s selection remains held. Resolve the scheduling issue and retry the reservation; no additional approval is needed.',offer.provider_id,offer.agency_id,offer.request_id,offer.request_id]);
      }
    }
    return {processed:rows.length,failed};
  }
  return { ensure, view, respond, get, releaseSlot, decideRequest, processBookings };
}
export const replacementOffers = createReplacementOfferService();
