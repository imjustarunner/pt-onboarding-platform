import GoogleCalendarService from './googleCalendar.service.js';
import { createHash } from 'node:crypto';
import pool from '../config/database.js';
import OfficeEvent from '../models/OfficeEvent.model.js';
import Appointment from '../models/Appointment.model.js';
import BookingPackage from '../models/BookingPackage.model.js';
import OfficeScheduleMaterializer from './officeScheduleMaterializer.service.js';
import { assertAppointmentClients, ensureAppointmentClinicalLink } from './appointmentClinicalLink.service.js';
import { withClientSchedulingLock } from './clientSchedulingGuard.service.js';
import { assertAppointmentWindowAvailable } from './appointmentConflict.service.js';
import { createAppointment, getAppointmentBundle } from './appointment.service.js';
import { scheduleSessionNotifications } from './sessionNotification.service.js';
import { appointmentScheduleNotices } from './appointmentScheduleNotice.service.js';
import { normalizeCustomSessionReminders, validateCustomReminderChannels } from './appointmentNotificationCustomization.service.js';
import { expandAppointmentRecurrence } from '../utils/appointmentRecurrence.js';
import { wallMysqlToUtcMysql } from '../utils/zonedWallTime.util.js';
import { withinOfficeRecordWindow } from '../utils/officeRecordWindow.js';

const sqlTime = value => value instanceof Date ? value.toISOString().slice(0, 19).replace('T', ' ') : String(value || '').replace('T', ' ').replace(/Z$/, '').slice(0, 19);
const parse = value => typeof value === 'string' ? JSON.parse(value || '{}') : value || {};
const fail = (message, extra = {}) => Object.assign(new Error(message), { status: 409, code: 'RESERVED_OFFICE_SESSION_CONFLICT', ...extra });
const owned = (event, providerId) => event && Number(event.assigned_provider_id || event.booked_provider_id) === Number(providerId)
  && (!Number(event.booked_provider_id) || Number(event.booked_provider_id) === Number(providerId)) && event.slot_state !== 'COMPANY_HOLD';

export function ownedOfficeSessionOccurrences({ startAt, endAt, timeZone, recurrence, occurrenceCount }) {
  return expandAppointmentRecurrence({ startAt: `${sqlTime(startAt).replace(' ', 'T')}Z`, endAt: `${sqlTime(endAt).replace(' ', 'T')}Z`, timeZone,
    recurrence, occurrenceCount: occurrenceCount || 1 }).map(row => ({ date: row.startAt.slice(0, 10),
    startAt: wallMysqlToUtcMysql(row.startAt, timeZone), endAt: wallMysqlToUtcMysql(row.endAt, timeZone) }));
}
async function reservationFor(db, input, occurrence) {
  const [events] = await db.execute(`SELECT * FROM office_events WHERE office_location_id=? AND room_id=?
    AND start_at<=? AND end_at>=? AND (status IS NULL OR status<>'CANCELLED') ORDER BY id`,
  [input.office.id, input.roomId, occurrence.startAt, occurrence.endAt]);
  return events.length === 1 ? events[0] : null;
}

export function ownedOfficeSessionBookingKey(input) {
  return createHash('sha256').update(JSON.stringify([input.agencyId, input.providerId, input.clientId, input.roomId,
    input.startAt, input.endAt, input.recurrence, input.occurrenceCount || 1])).digest('hex');
}

export async function findOwnedOfficeSessionReservation(input) {
  if (!input.roomId || !input.clientId || input.appointmentId || input.appointmentSeriesId) return null;
  const occurrences = ownedOfficeSessionOccurrences({ ...input, timeZone: input.office.timezone || 'America/Denver' });
  const first = await reservationFor(pool, input, occurrences[0]);
  return owned(first, input.providerId) ? first : null;
}

/** Scheduling a client uses the provider's room reservation; it does not request or reassign the room. */
export async function bookSessionInOwnedOffice(input) {
  if (!input.roomId || !input.clientId || input.appointmentId || input.appointmentSeriesId) return null;
  const occurrences = ownedOfficeSessionOccurrences({ ...input, timeZone: input.office.timezone || 'America/Denver' });
  if (!await findOwnedOfficeSessionReservation(input)) return null; // New/unassigned room requests keep their approval workflow.
  const progress = async (phase, completed = 0) => input.onProgress?.({ phase, completed, total: occurrences.length });
  return withClientSchedulingLock([input.clientId], async () => {
    const timeZone = input.office.timezone || 'America/Denver';
    if (occurrences.some(row => !withinOfficeRecordWindow(row.date, timeZone))) throw fail('Choose session dates within the next year.');
    // Generate only missing reservation weeks, before taking the room writer's lock.
    await progress('preparing');
    for (const [index, occurrence] of occurrences.entries()) {
      if (!await reservationFor(pool, input, occurrence)) await OfficeScheduleMaterializer.materializeWeek({
        officeLocationId: input.office.id, weekStartRaw: occurrence.date, createdByUserId: input.actorUserId,
        reservationWindow: { ...occurrence, roomId: input.roomId } });
      await progress('preparing', index + 1);
    }
    const db = await pool.getConnection();
    const lockName = OfficeEvent.lockNameForSlot({ roomId: input.roomId });
    let locked = false;
    const linked = [];
    const selected = [];
    let bookingSource;
    try {
      const [[lock]] = await db.execute('SELECT GET_LOCK(?,8) AS acquired', [lockName]);
      locked = Number(lock?.acquired) === 1;
      if (!locked) throw fail('This room is being updated. Retry this booking shortly.');
      const customReminders = normalizeCustomSessionReminders(input.customReminders || []);
      await validateCustomReminderChannels(input.agencyId, customReminders);
      await assertAppointmentClients(input.agencyId, [{ clientId: input.clientId }]);
      const key = ownedOfficeSessionBookingKey(input);
      bookingSource = `reserved_office_session:${key.slice(0, 32)}`;
      await progress('checking');
      // Check every requested date before creating any appointment or modifying a reservation.
      for (const occurrence of occurrences) {
        const event = await reservationFor(db, input, occurrence);
        if (!owned(event, input.providerId)) throw fail(`Your room reservation does not cover ${occurrence.date}. Choose dates and times reserved to you.`, { blockedDate: occurrence.date });
        if (sqlTime(event.start_at) !== occurrence.startAt || sqlTime(event.end_at) !== occurrence.endAt) {
          throw fail(`The session on ${occurrence.date} must match the selected reservation’s time. Select the matching office slot.`, { blockedDate: occurrence.date });
        }
        const context = parse(event.session_context_json);
        const appointment = await Appointment.findByOfficeEventId(event.id);
        const resume = context.reservedSessionBookingKey === key || appointment?.source === bookingSource;
        if ((event.client_id || event.clinical_session_id || appointment) && !resume) throw fail(`Your room already contains a client session on ${occurrence.date}. Open that appointment to edit it.`, { blockedDate: occurrence.date });
        if (appointment && (Number(appointment.agencyId) !== Number(input.agencyId)
            || Number(appointment.providerUserId) !== Number(input.providerId)
            || !['scheduled', 'confirmed', 'client_confirmed'].includes(appointment.status))) throw fail('The existing session changed. Open it before retrying.');
        await assertAppointmentWindowAvailable(db, { agencyId: input.agencyId, providerUserId: input.providerId,
          startAt: occurrence.startAt, endAt: occurrence.endAt, officeEventId: event.id, status: 'scheduled', sourceTimezone: timeZone }, appointment?.id || null);
        selected.push({ occurrence, event, context, appointment });
        await progress('checking', selected.length);
      }
      if (input.packageEntitlementId) {
        const entitlement = await BookingPackage.findEntitlementById(input.packageEntitlementId, input.agencyId);
        const needed = selected.filter(row => !row.appointment).length;
        if (!entitlement || Number(entitlement.clientId) !== Number(input.clientId) || (needed && (entitlement.status !== 'ACTIVE' || Number(entitlement.sessionsRemaining) < needed))) {
          throw fail(`The selected package needs ${needed} available sessions for this booking.`);
        }
      }
      await progress('saving');
      for (const row of selected) {
        const { event, occurrence } = row;
        if (row.appointment && row.context.reservedSessionBookingComplete) {
          linked.push(row.appointment);
          if (input.refreshCompletedCalendars) await GoogleCalendarService.upsertBookedOfficeEvent({ officeEventId: event.id, sendUpdates: 'none' });
          await progress('saving', linked.length); continue;
        }
        const context = { ...row.context, agencyId: input.agencyId, clientId: input.clientId, bookingSource: 'reserved_office_session',
          reservedSessionBookingKey: key, schedulingNotes: input.notes || null, notificationMode: input.notificationMode || 'default', customReminders,
          tenantServiceId: input.tenantServiceId || null, packageEntitlementId: input.packageEntitlementId || null };
        let appointment = row.appointment;
        if (!appointment) appointment = await createAppointment({ agencyId: input.agencyId, providerUserId: input.providerId,
          startAt: `${occurrence.startAt.replace(' ', 'T')}Z`, endAt: `${occurrence.endAt.replace(' ', 'T')}Z`, timeZone,
          officeEventId: event.id, officeLocationId: input.office.id, roomId: input.roomId,
          modality: input.modality, serviceCode: input.serviceCode, serviceLocationId: input.serviceLocationId,
          addonServiceCodes: input.addonServiceCodes || [], tenantServiceId: input.tenantServiceId, packageEntitlementId: input.packageEntitlementId,
          title: 'Client session', notes: input.notes, notificationMode: input.notificationMode || 'default', customReminders,
          source: bookingSource, createdByUserId: input.actorUserId,
          participants: [{ role: 'client', clientId: input.clientId, isBillingResponsible: true, receivesReminders: true }],
          ensureContext: false, deferScheduleNotice: true });
        linked.push(appointment);
        context.appointmentId = appointment.id;
        // Keep the standing owner, plan, room and time. Only the clinical occurrence gets its selected agency.
        await pool.execute(`UPDATE office_events SET client_id=?,booked_provider_id=?,status='BOOKED',slot_state='ASSIGNED_BOOKED',
          appointment_type_code='SESSION',service_code=?,modality=?,service_location_id=?,notes=?,session_context_json=?
          WHERE id=? AND (client_id IS NULL OR client_id=?)`,
        [input.clientId, input.providerId, input.serviceCode, input.modality, input.serviceLocationId || null, input.notes || null, JSON.stringify(context), event.id, input.clientId]);
        await ensureAppointmentClinicalLink(appointment.id, input.actorUserId);
        await progress('saving', linked.length);
      }
      // An interrupted series is retryable; notices are released only after every session is linked.
      await progress('finishing');
      for (const [index, row] of selected.entries()) {
        if (row.context.reservedSessionBookingComplete) { await progress('finishing', index + 1); continue; }
        const appointment = linked.find(a => Number(a.officeEventId) === Number(row.event.id));
        await scheduleSessionNotifications(appointment.id, { replace: true });
        await appointmentScheduleNotices.queue(appointment.id, { eventType: 'created', actorUserId: input.actorUserId });
        try { await GoogleCalendarService.upsertBookedOfficeEvent({ officeEventId: row.event.id }); } catch { /* The saved app appointment remains authoritative. */ }
        await pool.execute("UPDATE office_events SET session_context_json=JSON_SET(session_context_json,'$.reservedSessionBookingComplete',TRUE) WHERE id=?", [row.event.id]);
        await progress('finishing', index + 1);
      }
      OfficeScheduleMaterializer.invalidateOffice(input.office.id);
      return { ok: true, kind: 'auto_booked', officeEventId: selected[0].event.id,
        event: await OfficeEvent.findById(selected[0].event.id), appointment: await getAppointmentBundle(linked[0].id), appointmentIds: linked.map(a => a.id) };
    } catch (error) {
      // A dependency can fail after the canonical appointment was inserted. Keep its retry identity.
      for (const row of selected) {
        try {
          const saved = await Appointment.findByOfficeEventId(row.event.id);
          if (saved?.source === bookingSource && !linked.some(a => a.id === saved.id)) linked.push(saved);
        } catch { /* Preserve the original failure; the next retry rechecks the saved appointment. */ }
      }
      if (linked.length) { error.code = 'BOOKING_INCOMPLETE'; error.createdAppointmentIds = linked.map(a => a.id);
        error.message = `Part of this session series saved. Retry the same booking to finish linking it. ${error.message}`; }
      throw error;
    } finally {
      try { if (locked) await db.execute('SELECT RELEASE_LOCK(?)', [lockName]); }
      finally { db.release(); }
    }
  });
}
