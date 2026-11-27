import pool from '../config/database.js';
import OfficeStandingAssignment from '../models/OfficeStandingAssignment.model.js';
import OfficeScheduleMaterializer, { isAssignmentActiveOnDate } from './officeScheduleMaterializer.service.js';
import { roomBlockForSession } from '../utils/officeSessionWindow.js';
import { utcDateToZonedYmd, utcMysqlToIso } from '../utils/zonedWallTime.util.js';

async function availableRooms(row, officeId, { executor = pool, eventId = null } = {}) {
  const [rooms] = await executor.execute(`SELECT e.id,e.room_id,r.label,r.name FROM office_events e JOIN office_rooms r ON r.id=e.room_id
    WHERE e.office_location_id=? AND r.location_id=e.office_location_id AND r.is_active=1
      AND COALESCE(e.booked_provider_id,e.assigned_provider_id)=?
      AND e.start_at<=? AND e.end_at>=? AND (e.status='BOOKED' OR (e.status='RELEASED' AND e.slot_state IN ('ASSIGNED_AVAILABLE','ASSIGNED_TEMPORARY')))
      AND COALESCE(e.slot_state,'') NOT IN ('COMPANY_HOLD','FORFEITED') AND e.client_id IS NULL
      AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(e.session_context_json,'$.officeCancellationDisposition')),'')<>'release'
      AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(e.session_context_json,'$.roomOccupancy')),'')<>'vacant'
      AND (JSON_EXTRACT(e.session_context_json,'$.agencyId') IS NULL
        OR JSON_UNQUOTE(JSON_EXTRACT(e.session_context_json,'$.agencyId')) IN ('null',CAST(? AS CHAR)))
      ${eventId ? 'AND e.id=?' : ''}
      AND e.clinical_session_id IS NULL AND e.note_context_id IS NULL AND e.billing_context_id IS NULL
      AND NOT EXISTS (SELECT 1 FROM appointments ap WHERE
        (ap.office_event_id=e.id OR (ap.room_id=e.room_id AND ap.start_at<? AND ap.end_at>?))
        AND ap.status NOT IN ('draft','canceled_by_provider','canceled_by_client','canceled_by_guardian','canceled_by_organization','late_canceled','rescheduled','voided'))
      AND NOT EXISTS (SELECT 1 FROM office_events overlap WHERE overlap.room_id=e.room_id AND overlap.id<>e.id
        AND overlap.start_at<? AND overlap.end_at>? AND (overlap.status IS NULL OR overlap.status<>'CANCELLED'))
    ORDER BY r.sort_order,r.id,e.id LIMIT 1`,
  [officeId, row.providerId, row.startAt, row.endAt, row.agencyId, ...(eventId ? [eventId] : []), row.endAt, row.startAt, row.endAt, row.startAt]);
  return rooms[0] || null;
}

async function loadOffice(row) {
  const [[office]] = await pool.execute(`SELECT o.id,o.timezone FROM office_locations o WHERE o.id=? AND o.is_active=1
    AND (o.agency_id=? OR EXISTS (SELECT 1 FROM office_location_agencies map WHERE map.office_location_id=o.id AND map.agency_id=?))`,
  [row.officeLocationId, row.agencyId, row.agencyId]);
  if (!office) throw Object.assign(new Error('Choose an office building available to this agency.'), { status: 400 });

  return office;
}

export async function agendaOfficeReservation({ actor, row, materialize = false }) {
  const office = await loadOffice(row);
  let room = await availableRooms(row, office.id);
  if (!room && materialize) {
    const zone = office.timezone || row.timeZone;
    const date = utcDateToZonedYmd(utcMysqlToIso(row.startAt), zone);
    const block = roomBlockForSession(row.startAt, row.endAt, zone);
    // Standing assignments are hour-based. Materialize only this provider's candidate windows.
    if (Date.parse(utcMysqlToIso(block.endAt)) - Date.parse(utcMysqlToIso(block.startAt)) === 3600000) {
      const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: 'numeric', hourCycle: 'h23' })
        .format(new Date(utcMysqlToIso(block.startAt))));
      const assignments = await OfficeStandingAssignment.listByOffice(office.id);
      for (const assignment of assignments) {
        if (Number(assignment.provider_id) !== row.providerId || Number(assignment.hour) !== hour
          || (assignment.booking_agency_id && Number(assignment.booking_agency_id) !== row.agencyId)
          || !isAssignmentActiveOnDate(assignment, date)) continue;
        await OfficeScheduleMaterializer.materializeWeek({ officeLocationId: office.id, weekStartRaw: date, createdByUserId: actor.id,
          reservationWindow: { roomId: Number(assignment.room_id), date, startAt: block.startAt, endAt: block.endAt } });
      }
      room = await availableRooms(row, office.id);
    }
  }
  return room ? { office, eventId: Number(room.id), roomId: Number(room.room_id), label: room.label || room.name || `Room #${room.room_id}` } : null;
}

export async function bookAgendaOfficeReservation({ actor, row, reservation, existing }) {
  const { bookSessionInOwnedOffice, ownedOfficeSessionBookingKey } = await import('./ownedOfficeSession.service.js');
  if (existing) {
    if (Number(existing.officeLocationId) !== row.officeLocationId || !existing.officeEventId || !existing.roomId
      || !existing.source?.startsWith('reserved_office_session:')) return existing;
    reservation = { office: await loadOffice(row), eventId: Number(existing.officeEventId), roomId: Number(existing.roomId) };
  }
  const input = {
    office: reservation.office, roomId: reservation.roomId, agencyId: row.agencyId, providerId: row.providerId, actorUserId: actor.id, clientId: row.clientId,
    startAt: row.startAt, endAt: row.endAt, recurrence: 'ONCE', occurrenceCount: 1,
    tenantServiceId: row.tenantServiceId, serviceCode: row.serviceCode, serviceLocationId: row.serviceLocationId, modality: row.modality,
    checkReservation: async ({ db, event, resume }) => {
      if (Number(event.id) === reservation.eventId && (resume || await availableRooms(row, reservation.office.id, { executor: db, eventId: reservation.eventId }))) return;
      throw Object.assign(new Error('The provider’s room changed before booking. Check the reviewed appointments again.'), { status: 409 });
    }
  };
  if (existing && existing.source !== `reserved_office_session:${ownedOfficeSessionBookingKey(input).slice(0, 32)}`) return existing;
  const result = await bookSessionInOwnedOffice(input);
  if (!result?.appointment?.id) {
    throw Object.assign(new Error('The provider’s room changed before booking. Check the reviewed appointments again.'), { status: 409 });
  }
  return result.appointment;
}
