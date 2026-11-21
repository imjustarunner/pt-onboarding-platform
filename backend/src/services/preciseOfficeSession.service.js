import { officeSessionGapSql } from '../utils/officeSessionGap.js';
import { isAvailableOfficeRelease, isBorrowableOfficeRelease } from '../utils/officeClientCancellation.js';
import { randomUUID } from 'node:crypto';
import pool from '../config/database.js';
import OfficeEvent from '../models/OfficeEvent.model.js';
import Appointment from '../models/Appointment.model.js';
import OfficeScheduleMaterializer from './officeScheduleMaterializer.service.js';
import { expandAppointmentRecurrence } from '../utils/appointmentRecurrence.js';
import { utcToZonedMysqlWall, mysqlDateTimeForDateHour } from '../utils/officeEventDateTime.util.js';
import { utcMysqlToIso } from '../utils/zonedWallTime.util.js';
import { sessionWindowInRoom } from '../utils/officeSessionWindow.js';
import { withClientSchedulingLock } from './clientSchedulingGuard.service.js';
import { assertAppointmentWindowAvailable } from './appointmentConflict.service.js';
import { ensureAppointmentContext } from './appointmentContext.service.js';
import { queueOfficeEventGoogleSync } from './providerAssignmentGoogleSync.service.js';
import { appointmentScheduleNotices } from './appointmentScheduleNotice.service.js';
import { bookingNoticePreferenceFacts, recurringBookingNoticeFacts } from '../utils/recurringBookingNotice.js';

const fail = message => Object.assign(new Error(message), { status: 409 });
const sql = value => utcMysqlToIso(value)?.slice(0, 19).replace('T', ' ');
const contextOf = row => typeof row.session_context_json === 'string' ? JSON.parse(row.session_context_json) : row.session_context_json || {};

export async function approvePreciseOfficeSessions({ request, office, room, context, selection, recurrence, actorUserId }) {
  const timeZone = office.timezone || 'America/Denver';
  const providerId = Number(request.requested_provider_id);
  const clientId = Number(request.client_id);
  const requestStart = utcToZonedMysqlWall(request.start_at, timeZone);
  const requestEnd = utcToZonedMysqlWall(request.end_at, timeZone);
  const startHour = Number(requestStart.slice(11, 13));
  const endHour = requestEnd.slice(0, 10) === requestStart.slice(0, 10) ? Number(requestEnd.slice(11, 13)) : 24;
  const roomWindows = expandAppointmentRecurrence({
    startAt: utcMysqlToIso(request.start_at), endAt: utcMysqlToIso(request.end_at),
    recurrence, occurrenceCount: Number(request.booked_occurrence_count || 1), timeZone
  }).map(window => {
    const day = (window.startAt.endsWith('Z') ? utcToZonedMysqlWall(window.startAt, timeZone) : window.startAt).slice(0, 10);
    const hours = Array.from({ length: endHour - startHour }, (_, index) => ({
      startAt: mysqlDateTimeForDateHour(day, startHour + index, timeZone),
      endAt: mysqlDateTimeForDateHour(day, startHour + index + 1, timeZone)
    }));
    if (!hours.length || hours.some(hour => !hour.startAt || !hour.endAt || hour.endAt <= hour.startAt)) throw fail('One of the approved room hours falls in a clock change.');
    return { day, hours, session: sessionWindowInRoom(hours[0].startAt, hours.at(-1).endAt, context.sessionOffsets, timeZone) };
  });

  return withClientSchedulingLock([clientId], async () => {
    const groupId = roomWindows.length > 1 ? String(context.officeSessionSeriesId || randomUUID()) : null;
    const events = [];
    for (const window of roomWindows) {
      await OfficeScheduleMaterializer.materializeWeek({ officeLocationId: office.id, weekStartRaw: window.day, createdByUserId: actorUserId });
      const [[prior]] = await pool.execute(`SELECT id FROM office_events WHERE room_id=? AND start_at=? AND client_id=?
        AND JSON_EXTRACT(session_context_json, '$.preciseOfficeRequestId')=? AND status='BOOKED' LIMIT 1`,
      [room.id, window.hours[0].startAt, clientId, request.id]);
      const appointment = prior ? await Appointment.findByOfficeEventId(prior.id) : null;
      await assertAppointmentWindowAvailable(pool, { ...window.session, providerUserId: providerId,
        agencyId: context.agencyId, officeEventId: prior?.id, status: 'scheduled', sourceTimezone: timeZone }, appointment?.id || null);
      events.push({ ...window, prior });
    }
    const linkedEventIds = [];
    const appointments = [];
    for (const window of events) {
      const eventId = window.prior?.id || await reserveHours(window);
      await ensureAppointmentContext({ officeEventId: eventId, agencyId: context.agencyId, clientId, actorUserId });
      const saved = await Appointment.findByOfficeEventId(eventId);
      if (!saved) throw fail('The room is booked. Retry this request to finish linking the session.');
      appointments.push(saved);
      await queueOfficeEventGoogleSync(eventId).catch(() => {});
      linkedEventIds.push(Number(eventId));
    }
    const facts = { ...recurringBookingNoticeFacts(groupId, appointments), ...bookingNoticePreferenceFacts(context.sendBookingNotice) };
    for (const appointment of appointments) await appointmentScheduleNotices.queue(appointment.id, { eventType: 'created', facts, actorUserId });
    OfficeScheduleMaterializer.invalidateOffice(office.id);
    return linkedEventIds;

    async function reserveHours(window) {
      const startAt = window.hours[0].startAt;
      const endAt = window.hours.at(-1).endAt;
      return OfficeEvent.withRoomSlotLock({ roomId: room.id, startAt, endAt }, async conn => {
        const [conflicts] = await conn.execute(`SELECT e.*, ${officeSessionGapSql()} AS office_gap_blocked, EXISTS(SELECT 1 FROM appointments a WHERE a.office_event_id=e.id) AS has_appointment
          FROM office_events e WHERE room_id=? AND start_at<? AND end_at>? AND (e.status IS NULL OR e.status<>'CANCELLED') FOR UPDATE`,
        [room.id, endAt, startAt]);
        const byStart = new Map(conflicts.map(row => [sql(row.start_at), row]));
        const requestedHours = new Map(window.hours.map(hour => [hour.startAt, hour.endAt]));
        if (byStart.size !== conflicts.length || conflicts.some(row => requestedHours.get(sql(row.start_at)) !== sql(row.end_at)
          || (!(recurrence === 'ONCE' && isAvailableOfficeRelease(row))
            && [row.assigned_provider_id, row.booked_provider_id].some(owner => Number(owner) > 0 && Number(owner) !== providerId))
          || row.client_id || row.clinical_session_id || row.billing_context_id || row.note_context_id || row.has_appointment || row.status_outcome
          || row.slot_state === 'COMPANY_HOLD' || (row.status === 'BOOKED' && !row.booked_provider_id))) {
          throw fail('The selected room is no longer available for every requested hour.');
        }
        let firstId;
        for (const hour of window.hours) {
          const existing = byStart.get(hour.startAt);
          const lead = hour.startAt === startAt;
          const saved = existing || await OfficeEvent.create({ officeLocationId: office.id, roomId: room.id, ...hour,
            status: 'BOOKED', slotState: 'ASSIGNED_BOOKED', assignedProviderId: providerId, bookedProviderId: providerId,
            source: 'PROVIDER_REQUEST', createdByUserId: actorUserId, approvedByUserId: actorUserId, executor: conn
          });
          const persistedContext = lead ? { ...context, sessionStartAt: window.session.startAt, sessionEndAt: window.session.endAt, preciseOfficeRequestId: Number(request.id), deferScheduleNotice: true }
            : contextOf(saved);
          if (isBorrowableOfficeRelease(existing)) persistedContext.officeCancellationDisposition = 'release';
          await conn.execute(`UPDATE office_events SET status='BOOKED', slot_state='ASSIGNED_BOOKED', assigned_provider_id=?,
            booked_provider_id=?, client_id=?, recurrence_group_id=COALESCE(?,recurrence_group_id), session_context_json=?,
            appointment_type_code=COALESCE(?,appointment_type_code), service_code=COALESCE(?,service_code),
            service_location_id=COALESCE(?,service_location_id), modality=COALESCE(?,modality), approved_by_user_id=?, updated_at=CURRENT_TIMESTAMP
            WHERE id=?`, [existing?.assigned_provider_id || providerId, providerId, lead ? clientId : null, lead ? groupId : null, JSON.stringify(persistedContext),
            lead ? selection.appointmentTypeCode : null, lead ? selection.serviceCode : null,
            lead ? request.service_location_id || null : null, lead ? selection.modality : null, actorUserId, saved.id]);
          if (lead) firstId = saved.id;
        }
        return firstId;
      });
    }
  });
}
