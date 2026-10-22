import { readPrivateReplacementSlots } from './privateReplacementSlots.service.js';
import { maybeDecryptNotePayload } from './clinicalNoteCrypto.service.js';
import { wallMysqlToUtcMysql, utcDateToZonedParts } from '../utils/zonedWallTime.util.js';
import pool from '../config/database.js';
import Appointment from '../models/Appointment.model.js';
import { parseUtcDate } from '../utils/officeEventDateTime.util.js';
import { addDaysYmd } from '../utils/scheduleRecurrence.js';
import { MAX_REPLACEMENT_SLOTS, replacementOpeningWindow } from './replacementOpeningWindow.js';

const fail = message => Object.assign(new Error(message), { status: 400 });
export const slotKey = slot => [slot.startAt, slot.endAt, slot.modality, slot.roomId || ''].join('|');
export const replacementFormats = slot => slot.modality === 'BOTH' ? ['IN_PERSON', 'VIRTUAL'] : [slot.modality];
const requestedModality = (value, appointment) => {
  const modality = value || (/virtual|telehealth|video/i.test(appointment.modality || '') ? 'VIRTUAL' : 'IN_PERSON');
  if (!['IN_PERSON', 'VIRTUAL', 'BOTH'].includes(modality)) throw fail('Choose in office, virtual, or both for this time.');
  return modality;
};
export const replacementSlotLabel = slot => `${appointmentTimeLabel(slot.startAt, slot.timeZone)} (${slot.timeZone}) · ${(parseUtcDate(slot.endAt) - parseUtcDate(slot.startAt)) / 60000} min · ${
  slot.modality === 'VIRTUAL' || slot.availableFormats?.length === 1 && slot.availableFormats[0] === 'VIRTUAL' ? 'Virtual'
    : `In office: ${slot.buildingName || 'Office'} ${slot.roomLabel || ''}${slot.modality === 'BOTH' && (!slot.availableFormats || slot.availableFormats.includes('VIRTUAL')) ? ' or virtual — client chooses' : ''}`}`;

// Resolve a client's choice without carrying the physical room into a virtual visit.
export function selectReplacementFormat(slot, selectedModality) {
  const allowed = replacementFormats(slot).filter(f => !slot.availableFormats || slot.availableFormats.includes(f));
  const modality = selectedModality || (allowed.length === 1 ? allowed[0] : null);
  if (!allowed.includes(modality)) throw fail('Choose an available appointment format for this time.');
  const selected = { ...slot, modality, availableFormats: [modality] };
  if (modality === 'VIRTUAL') Object.assign(selected, { roomId: null, buildingId: null, roomLabel: null,
    buildingName: null, officeEventId: null, officeEventIds: [] });
  selected.key = slotKey(selected);
  selected.label = replacementSlotLabel(selected);
  return selected;
}
export const appointmentTimeLabel = (value, timeZone = 'America/Denver') => new Intl.DateTimeFormat('en-US', {
  dateStyle: 'full', timeStyle: 'short', timeZone
}).format(parseUtcDate(value));

// Adjacent hourly reservations can cover a visit that begins on a quarter hour.
export function coveringReplacementRooms(reservations, start, end) {
  const grouped = new Map();
  for (const r of reservations || []) {
    if (!r.roomId || r.hasAppointment || !r.roomAvailable) continue;
    const id = Number(r.roomId);
    if (!grouped.has(id)) grouped.set(id, []);
    grouped.get(id).push(r);
  }
  const rooms = [];
  for (const [id, rows] of grouped) {
    let through = +start;
    const covering = [];
    for (const r of rows.sort((a,b) => +parseUtcDate(a.startAt)-+parseUtcDate(b.startAt))) {
      const s = +parseUtcDate(r.startAt), e = +parseUtcDate(r.endAt);
      if (e <= through || s > through) continue;
      covering.push(r); through = e;
      if (through >= +end) break;
    }
    if (through >= +end && covering.length) rooms.push({ ...covering[0], roomId: id, officeEventIds: covering.map(r=>r.id) });
  }
  return rooms;
}

export function validateCancellationChoices(facts = {}) {
  const notificationMode = facts.notificationMode || 'send';
  if (!['send', 'none'].includes(notificationMode)) throw fail('Choose whether to send cancellation notifications.');
  const suppressionReason = String(facts.suppressionReason || '').trim();
  if (notificationMode === 'none' && (!suppressionReason || suppressionReason.length > 500)) throw fail('Record why no notification should be sent (up to 500 characters).');
  const action = facts.followUpAction || 'keep_next';
  if (['private_slots', 'portal_booking'].includes(action)) {
    if (notificationMode === 'none') throw fail('Send a notification when inviting the client to choose a replacement time.');
    if (facts.eventType !== 'canceled') throw fail('Replacement offers are for a canceled appointment, not an already-booked replacement.');
    const days = Number(facts.offerDays ?? 2);
    if (![1, 2, 3, 7, 14].includes(days)) throw fail('Choose an offer duration of 1, 2, 3, 7, or 14 days.');
    if (action === 'private_slots' && (!Array.isArray(facts.offeredSlots) || !facts.offeredSlots.length || facts.offeredSlots.length > MAX_REPLACEMENT_SLOTS)) throw fail(`Choose between one and ${MAX_REPLACEMENT_SLOTS} replacement times.`);
  }
  return { notificationMode, suppressionReason };
}

export function createCancellationFollowUpService({ database = pool, appointments = Appointment,
  availability = { computeWeekAvailability: async args => (await import('./providerAvailability.service.js')).default.computeWeekAvailability(args) },
  roomOptions = async (...args) => (await import('./replacementOfficeRequest.service.js')).oneTimeReplacementRoomOptions(...args),
  validateDuration = async (...args) => (await import('./replacementDuration.service.js')).validateReplacementDuration(...args),
  now = () => new Date() } = {}) {
  async function nextAppointment(appointment, clientId, { afterAt = null, excludeAppointmentIds = [] } = {}) {
    const excluded = [...new Set(excludeAppointmentIds.map(Number).filter(id => Number.isSafeInteger(id) && id > 0))];
    // Same provider, service, and participant. Do not mistake another clinician's
    // appointment for continuation of this care. Prefer an actual series match.
    const [rows] = await database.execute(`SELECT a.id,a.start_at,a.source_timezone,
      ((p.recurrence_series_id IS NOT NULL AND p.recurrence_series_id=anchor_p.recurrence_series_id)
        OR (e.booking_plan_id IS NOT NULL AND e.booking_plan_id=anchor_e.booking_plan_id)) AS same_series
      FROM appointments a JOIN appointment_participants ap ON ap.appointment_id=a.id AND ap.client_id=?
      JOIN appointments anchor ON anchor.id=?
      LEFT JOIN provider_schedule_events p ON p.id=a.provider_schedule_event_id
      LEFT JOIN provider_schedule_events anchor_p ON anchor_p.id=anchor.provider_schedule_event_id
      LEFT JOIN office_events e ON e.id=a.office_event_id
      LEFT JOIN office_events anchor_e ON anchor_e.id=anchor.office_event_id
      WHERE a.id<>anchor.id AND a.agency_id=anchor.agency_id AND a.provider_user_id=anchor.provider_user_id
        AND a.tenant_service_id <=> anchor.tenant_service_id AND a.service_code <=> anchor.service_code
        AND a.status IN ('scheduled','confirmed','client_confirmed')
        AND a.start_at>GREATEST(anchor.start_at,UTC_TIMESTAMP(),COALESCE(?,anchor.start_at))
      ${excluded.length ? `AND a.id NOT IN (${excluded.map(() => '?').join(',')})` : ''}
      ORDER BY same_series DESC,a.start_at,a.id LIMIT 1`, [clientId, appointment.id, afterAt, ...excluded]);
    const row = rows[0];
    return row ? { id: Number(row.id), startAt: parseUtcDate(row.start_at).toISOString(),
      displayWhen: appointmentTimeLabel(row.start_at, row.source_timezone || appointment.sourceTimezone),
      timeZone: row.source_timezone || appointment.sourceTimezone || 'America/Denver', recurring: !!Number(row.same_series) } : null;
  }
  async function bookingEnabled(appointment) {
    const [[row]] = await database.execute(`SELECT a.public_availability_enabled,
      EXISTS(SELECT 1 FROM provider_public_service_enrollments e
        JOIN agency_public_service_types s ON s.agency_id=e.agency_id AND s.service_type=e.service_type AND s.is_enabled=1
        WHERE e.agency_id=a.id AND e.user_id=? AND e.is_active=1 AND e.service_type='counseling') AS enrolled
      FROM agencies a WHERE a.id=?`, [appointment.providerUserId, appointment.agencyId]);
    return Number(row?.public_availability_enabled) === 1 && Number(row?.enrolled) === 1;
  }
  async function slots(appointment, { days = 28, excludePublicRequestId = null } = {}) {
    const duration = (parseUtcDate(appointment.endAt) - parseUtcDate(appointment.startAt)) / 60000;
    if (!Number.isFinite(duration) || duration < 15 || duration > 240) return [];
    const zone = appointment.sourceTimezone || 'America/Denver';
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now());
    const end = +now() + days * 86400000;
    const found = new Map();
    // Include the partial first week and the partial last week.
    for (let day = 0; day <= days; day += 7) {
      const week = await availability.computeWeekAvailability({ agencyId: appointment.agencyId, providerId: appointment.providerUserId,
        weekStartYmd: addDaysYmd(today, day), slotMinutes: duration, intakeOnly: false, includeExternalBusy: true, materializeOfficeEvents: false,
        includePrivateOffers: true, excludePublicRequestId });
      const virtualTimes = new Set((week.virtualSlots || []).map(s => `${s.startAt}|${s.endAt}`));
      const inPersonTimes = new Set((week.inPersonSlots || []).map(s => `${s.startAt}|${s.endAt}`));
      const choices = [
        ...(week.inPersonSlots || []).map(s => ({ ...s, modality: virtualTimes.has(`${s.startAt}|${s.endAt}`) ? 'BOTH' : 'IN_PERSON' })),
        ...(week.virtualSlots || []).filter(s => !inPersonTimes.has(`${s.startAt}|${s.endAt}`)).map(s => ({ ...s, modality: 'VIRTUAL' }))
      ];
      for (const slot of choices) {
        if (+new Date(slot.startAt) <= +now() || +new Date(slot.startAt) >= end) continue;
        const clean = { startAt: slot.startAt, endAt: slot.endAt, modality: slot.modality,
          roomId: slot.modality === 'VIRTUAL' ? null : slot.roomId || null, buildingId: slot.modality === 'VIRTUAL' ? null : slot.buildingId || null,
          roomLabel: slot.modality === 'VIRTUAL' ? null : slot.roomLabel || null,
          buildingName: slot.modality === 'VIRTUAL' ? null : slot.buildingName || null, timeZone: week.timeZone || zone };
        clean.key = slotKey(clean);
        clean.availableFormats = replacementFormats(clean);
        clean.label = replacementSlotLabel(clean);
        found.set(clean.key, clean);
      }
    }
    return [...found.values()].sort((a, b) => a.startAt.localeCompare(b.startAt));
  }
  async function validatePrivateSlots(appointment, candidates, { excludePublicRequestId = null, skipUnavailable = false } = {}) {
    const originalDuration = +parseUtcDate(appointment.endAt) - +parseUtcDate(appointment.startAt);
    const zone = appointment.sourceTimezone || 'America/Denver';
    const weeks = new Map(), checkedLengths = new Set(), result = [];
    for (const candidate of candidates) {
      try {
        const modality = requestedModality(candidate.modality, appointment);
        const start = parseUtcDate(candidate.startAt), end = parseUtcDate(candidate.endAt);
        const duration = +end - +start;
        if (!start || !end || !Number.isFinite(+start) || +start <= +now() || +start > +now()+120*86400000
          || (duration !== originalDuration && ![30,45,60].includes(duration/60000)) || duration<15*60000 || duration>240*60000) throw fail('Choose a future time within 120 days with the original length or a supported 30, 45, or 60 minute length.');
        if (duration !== originalDuration) for (const format of replacementFormats({ modality })) {
          const lengthKey = `${duration}:${format}`;
          if (!checkedLengths.has(lengthKey)) {
            await validateDuration(appointment, { startAt: start.toISOString(), endAt: end.toISOString(), modality: format });
            checkedLengths.add(lengthKey);
          }
        }
        const date = new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(start);
        if (!weeks.has(date)) weeks.set(date, await availability.computeWeekAvailability({ agencyId: appointment.agencyId,
          providerId: appointment.providerUserId, weekStartYmd: date, slotMinutes:duration/60000, intakeOnly:false,
          materializeOfficeEvents:false, includePrivateCalendar:true, includePrivateOffers:true, excludePublicRequestId }));
        const week = weeks.get(date);
        if ((week.busyBlocks || []).some(b => +parseUtcDate(b.startAt)<+end && +parseUtcDate(b.endAt)>+start)) throw fail('That time conflicts with an appointment, pending selection, school assignment, or calendar commitment. Choose a free time.');
        let room = null;
        if (modality !== 'VIRTUAL') {
          room = coveringReplacementRooms(week.officeReservations, start, end).find(r => r.roomId === Number(candidate.roomId));
          if (!room && !(skipUnavailable && modality === 'BOTH')) throw fail('Choose one of your available room reservations covering this in-person visit.');
        }
        const clean = { startAt:start.toISOString(),endAt:end.toISOString(),modality,
          // Keep the offered identity stable if only its virtual choice is still available.
          roomId:room?.roomId || (modality === 'BOTH' ? Number(candidate.roomId) || null : null),buildingId:room?.buildingId || null,officeEventId:room?.id || null, officeEventIds:room?.officeEventIds || [],
          roomLabel:room?.roomLabel || null,buildingName:room?.buildingName || null,timeZone:zone };
        clean.availableFormats = modality === 'BOTH' && !room ? ['VIRTUAL'] : replacementFormats(clean);
        clean.key=slotKey(clean);
        clean.label=replacementSlotLabel(clean);
        result.push(clean);
      } catch(e) { if (!skipUnavailable || e.status !== 400) throw e; }
    }
    return result;
  }
  async function customSlot(appointmentId, { localStart, roomId, modality: requestedFormat } = {}) {
    const appointment=await appointments.findById(appointmentId);
    if (!appointment || parseUtcDate(appointment.startAt)<=now()) throw fail('Offer replacement times for a future appointment.');
    const modality = requestedModality(requestedFormat, appointment);
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(String(localStart))) throw fail('Choose a date and start time.');
    const utc=wallMysqlToUtcMysql(localStart.replace('T',' ')+':00',appointment.sourceTimezone || 'America/Denver');
    if (!utc) throw fail('That local time does not exist. Choose another time.');
    const start=parseUtcDate(utc),end=new Date(+start+(parseUtcDate(appointment.endAt)-parseUtcDate(appointment.startAt)));
    const zone=appointment.sourceTimezone || 'America/Denver';
    const parts=utcDateToZonedParts(start,zone), pad=n=>String(n).padStart(2,'0');
    if (!parts || `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}` !== localStart) throw fail('That local time does not exist. Choose another time.');
    if (+start<=+now() || +start>+now()+120*86400000 || +end-+start<15*60000 || +end-+start>240*60000) throw fail('Choose a future time within 120 days with the same appointment length.');
    const week=await availability.computeWeekAvailability({agencyId:appointment.agencyId,providerId:appointment.providerUserId,
      weekStartYmd:localStart.slice(0,10),intakeOnly:false,includePrivateCalendar:true,includePrivateOffers:true,materializeOfficeEvents:true});
    if ((week.busyBlocks || []).some(b => +parseUtcDate(b.startAt)<+end && +parseUtcDate(b.endAt)>+start)) throw fail('That time conflicts with another appointment or calendar commitment. Choose a free time.');
    const rooms=(modality === 'VIRTUAL' ? [] : coveringReplacementRooms(week.officeReservations,start,end))
      .map(r=>({id:r.roomId,buildingId:r.buildingId,label:`${r.buildingName || 'Office'} · ${r.roomLabel || r.roomId}`,needsRequest:false}));
    if (modality !== 'VIRTUAL') {
      rooms.push(...(await roomOptions(appointment,start,end)).filter(r=>!rooms.some(own=>own.id===r.id)));
    }
    if (modality !== 'VIRTUAL' && !roomId) return {rooms,slot:null,timeZone:zone};
    if (rooms.some(r=>r.id===Number(roomId) && r.needsRequest)) return {rooms,slot:null,requiresOfficeRequest:true,timeZone:zone};
    const [slot]=await validatePrivateSlots(appointment,[{startAt:start.toISOString(),endAt:end.toISOString(),roomId,modality}]);
    return {rooms,slot,timeZone:zone};
  }
  async function openingWindow(appointmentId, input = {}) {
    const appointment = await appointments.findById(appointmentId);
    if (!appointment || parseUtcDate(appointment.startAt) <= now()) throw fail('Offer replacement times for a future appointment.');
    const zone = appointment.sourceTimezone || 'America/Denver';
    const modality = requestedModality(input.modality, appointment);
    const { start, end, slots: candidates } = replacementOpeningWindow(input, zone, now());
    const week = await availability.computeWeekAvailability({ agencyId: appointment.agencyId, providerId: appointment.providerUserId,
      weekStartYmd: input.localStart.slice(0,10), intakeOnly:false, includePrivateCalendar:true, includePrivateOffers:true, materializeOfficeEvents:true });
    const rooms = modality === 'VIRTUAL' ? [] : coveringReplacementRooms(week.officeReservations, start, end)
      .map(r => ({ id:r.roomId, buildingId:r.buildingId, label:`${r.buildingName || 'Office'} · ${r.roomLabel || r.roomId}`, needsRequest:false }));
    if (modality !== 'VIRTUAL') rooms.push(...(await roomOptions(appointment,start,end)).filter(r => !rooms.some(own => own.id === r.id)));
    const base = { rooms, slots:[], unavailable:[], timeZone:zone };
    if (modality !== 'VIRTUAL' && !input.roomId) return base;
    if (rooms.some(r => r.id === Number(input.roomId) && r.needsRequest)) return { ...base, requiresOfficeRequest:true };
    if (modality !== 'VIRTUAL' && !rooms.some(r => r.id === Number(input.roomId))) throw fail('Choose a room reserved for this whole time window.');
    // Preflight length once so a service restriction is explained, not silently
    // presented as a day with no openings. Final review rechecks every slot.
    if (Number(input.durationMinutes) !== (parseUtcDate(appointment.endAt)-parseUtcDate(appointment.startAt))/60000) {
      for (const format of replacementFormats({modality})) await validateDuration(appointment,{...candidates[0],modality:format});
    }
    const free = candidates.filter(s => !(week.busyBlocks || []).some(b => +parseUtcDate(b.startAt)<+parseUtcDate(s.endAt) && +parseUtcDate(b.endAt)>+parseUtcDate(s.startAt)));
    base.slots = await validatePrivateSlots(appointment, free.map(s => ({ ...s, modality, roomId:input.roomId })));
    base.unavailable = candidates.filter(s => !free.includes(s)).map(s => ({ ...s, reason:'Conflicts with an appointment or calendar commitment.' }));
    return base;
  }
  async function context(appointmentId, { includeSlots = true } = {}) {
    const appointment = await appointments.findById(appointmentId);
    if (!appointment) throw fail('Appointment not found.');
    if (parseUtcDate(appointment.startAt) <= now()) return { retrospective: true, nextAppointment: null, singleClient: false, portalBookingEnabled: false, slots: [] };
    const clientIds = [...new Set((await appointments.listParticipants(appointmentId)).map(p => Number(p.clientId)).filter(Boolean))];
    const singleClient = clientIds.length === 1 && Number(appointment.providerUserId) > 0;
    const next = singleClient ? await nextAppointment(appointment, clientIds[0]) : null;
    // A private replacement invitation is individual, never a group cancellation.
    const enabled = singleClient && await bookingEnabled(appointment);
    const pools = singleClient ? await readPrivateReplacementSlots(database, appointment.providerUserId) : [];
    const offered = pools.filter(p => Number(p.agency_id) === Number(appointment.agencyId)).map(p => ({ ...JSON.parse(maybeDecryptNotePayload(typeof p.slot_json === 'string' ? p.slot_json : JSON.stringify(p.slot_json))), alreadyOffered: true, invitedCount: Number(p.invited_count), requested: !!Number(p.requested), expiresAt: p.expires_at }));
    const offeredKeys = new Map(offered.map(s => [s.key, s]));
    return { nextAppointment: next, singleClient, portalBookingEnabled: enabled, timeZone: appointment.sourceTimezone || 'America/Denver',
      durationMinutes: (parseUtcDate(appointment.endAt)-parseUtcDate(appointment.startAt))/60000, alreadyOffered: offered,
      slots: singleClient && includeSlots ? (await slots(appointment)).map(s => ({...s,...(offeredKeys.get(s.key) || {})})) : [] };
  }
  async function validateOffer(appointment, facts) {
    validateCancellationChoices(facts);
    const contextValue = await context(appointment.id, { includeSlots: facts.followUpAction === 'portal_booking' });
    if (!contextValue.singleClient) throw fail('Offer replacement times from an individual client appointment.');
    if (facts.followUpAction === 'portal_booking' && !contextValue.portalBookingEnabled) throw fail('Online booking must be enabled for this practice and provider. Choose specific private times instead.');
    const wanted = new Set((facts.offeredSlots || []).map(slotKey));
    const available = facts.followUpAction === 'portal_booking' ? contextValue.slots : await validatePrivateSlots(appointment, facts.offeredSlots);
    if (!available.length || (facts.followUpAction === 'private_slots' && available.length !== wanted.size)) throw fail('One or more replacement times are no longer available. Refresh the openings or keep the next appointment.');
    return available;
  }
  return { nextAppointment, bookingEnabled, slots, context, validateOffer, validatePrivateSlots, customSlot, openingWindow };
}
export const cancellationFollowUp = createCancellationFollowUpService();
