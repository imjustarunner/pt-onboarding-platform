import pool from '../config/database.js';
import Agency from '../models/Agency.model.js';
import { authorizeAgendaProvider } from './auricwellAgendaImport.service.js';
import { allocateOfficeRoom } from './officeRoomAllocation.service.js';
import { readProviderCalendarBusy } from './providerCalendarBusy.service.js';
import { agendaDate, agendaClock, addAgendaDays } from '../utils/auricwellAgendaPaste.js';
import { wallMysqlToUtcMysql, utcMysqlToIso, utcMysqlToZonedWallMysql } from '../utils/zonedWallTime.util.js';

const fail = (status, message) => Object.assign(new Error(message), { status });
const officeTime = (value, timeZone) => utcMysqlToZonedWallMysql(
  value instanceof Date ? value.toISOString() : utcMysqlToIso(value), timeZone
);
const wall = (date, time, zone) => wallMysqlToUtcMysql(`${date} ${time}:00`, zone);

async function scope(actor, input) {
  const agencyId = Number(input.agencyId), providerId = Number(input.providerId);
  await authorizeAgendaProvider({ actor, agencyId, providerId, planner: true });
  const date = agendaDate(input.date);
  if (!date) throw fail(400, 'Choose a date.');
  const agency = await Agency.findById(agencyId);
  return { agencyId, providerId, date, timeZone: agency?.timezone || 'America/Denver' };
}

export async function providerPlannerDay(actor, input) {
  const { agencyId, providerId, date, timeZone } = await scope(actor, input);
  const startAt = wall(date, '00:00', timeZone);
  const endAt = wall(addAgendaDays(date, 1), '00:00', timeZone);
  const [busy, [appointments], [reservations]] = await Promise.all([
    readProviderCalendarBusy(pool, { providerId, startAt, endAt, timeZone }),
    pool.execute(`SELECT start_at,end_at FROM appointments
      WHERE provider_user_id=? AND start_at<? AND end_at>?
      AND status NOT IN ('draft','canceled_by_provider','canceled_by_client','canceled_by_guardian','canceled_by_organization','late_canceled','rescheduled','voided')`,
    [providerId, endAt, startAt]),
    pool.execute(`SELECT e.office_location_id,e.start_at,e.end_at,r.name,r.label FROM office_events e
      JOIN office_rooms r ON r.id=e.room_id AND r.is_active=1
      JOIN office_locations o ON o.id=e.office_location_id AND o.is_active=1
      JOIN office_location_agencies a ON a.office_location_id=o.id AND a.agency_id=?
      WHERE COALESCE(e.booked_provider_id,e.assigned_provider_id)=? AND e.start_at<? AND e.end_at>?
      AND (e.status='BOOKED' OR (e.status='RELEASED' AND e.slot_state IN ('ASSIGNED_AVAILABLE','ASSIGNED_TEMPORARY')))
      AND COALESCE(e.slot_state,'') NOT IN ('COMPANY_HOLD','FORFEITED') AND e.client_id IS NULL
      AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(e.session_context_json,'$.officeCancellationDisposition')),'')<>'release'
      AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(e.session_context_json,'$.roomOccupancy')),'')<>'vacant'
      AND (JSON_EXTRACT(e.session_context_json,'$.agencyId') IS NULL
        OR JSON_UNQUOTE(JSON_EXTRACT(e.session_context_json,'$.agencyId')) IN ('null',CAST(? AS CHAR)))`,
    [agencyId, providerId, endAt, startAt, agencyId])
  ]);
  const ranges = [...busy, ...appointments.map(row => ({ start: row.start_at, end: row.end_at }))];
  const local = value => officeTime(value, timeZone);
  const dayMinute = (value, boundary) => {
    const stamp = local(value);
    return stamp.slice(0, 10) === date ? stamp.slice(11, 16) : boundary;
  };
  return {
    busy: [...new Map(ranges.map(({ start, end }) => {
      const range = { start: dayMinute(start, '00:00'), end: dayMinute(end, '24:00') };
      return [`${range.start}:${range.end}`, range];
    })).values()],
    reservations: reservations.map(row => ({
      officeId: Number(row.office_location_id), start: dayMinute(row.start_at, '00:00'),
      end: dayMinute(row.end_at, '24:00'), room: row.label || row.name
    }))
  };
}

export async function providerPlannerOfficeOptions(actor, input) {
  const { agencyId, providerId, date, timeZone } = await scope(actor, input);
  const startTime = agendaClock(input.startTime), endTime = agendaClock(input.endTime);
  if (!startTime || !endTime || startTime >= endTime) throw fail(400, 'Choose a start and end time for the room.');
  const startAt = wall(date, startTime, timeZone), endAt = wall(date, endTime, timeZone);
  if (!startAt || !endAt || endAt <= startAt || Date.parse(utcMysqlToIso(startAt)) <= Date.now()) {
    throw fail(400, 'Choose a future room window.');
  }
  const [offices] = await pool.execute(`SELECT o.id,o.name,o.timezone FROM office_locations o
    JOIN office_location_agencies a ON a.office_location_id=o.id AND a.agency_id=?
    WHERE o.is_active=1 AND o.physical_office_location_id IS NULL
      AND EXISTS (SELECT 1 FROM agency_service_locations s JOIN office_locations b ON b.id=s.billing_office_location_id
        WHERE s.agency_id=? AND s.is_active=1 AND COALESCE(s.is_provider_visible,1)=1 AND s.place_of_service='11' AND COALESCE(b.physical_office_location_id,b.id)=o.id)
    ORDER BY o.name,o.id`, [agencyId, agencyId]);
  const rooms = [], awaiting = [];
  for (const office of offices) {
    const zone = office.timezone || timeZone;
    const start = officeTime(startAt, zone), end = officeTime(endAt, zone);
    const startDate = start.slice(0, 10);
    if (end.slice(0, 10) !== startDate) continue;
    const startHour = Number(start.slice(11, 13));
    const endHour = Number(end.slice(11, 13)) + Number(end.slice(14, 16) !== '00');
    try {
      // Use the same inventory, pending holds, and room policy as request submission.
      const room = await allocateOfficeRoom(pool, {
        officeId: Number(office.id), providerId, startDate, startHour, endHour,
        recurrence: 'ONCE', occurrenceCount: 1, source: 'intake'
      });
      rooms.push({ officeId: Number(office.id), office: office.name, roomId: room.roomId, room: room.roomLabel,
        date: startDate, weekday: new Date(`${startDate}T12:00:00Z`).getUTCDay(), startHour, endHour, timeZone: zone });
    } catch (error) {
      if (error.code === 'ALREADY_REQUESTED') awaiting.push(office.name);
      else if (error.code !== 'NO_SUITABLE_OFFICE') throw error;
    }
  }
  return { rooms, awaiting };
}
