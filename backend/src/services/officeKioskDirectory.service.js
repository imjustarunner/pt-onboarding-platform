import { localDayUtcBounds, mysqlDateTimeForDateHour, utcToZonedMysqlWall } from '../utils/officeEventDateTime.util.js';
import { isAssignmentActiveOnDate, shouldBookOnDate, shouldBookByCount } from './officeScheduleMaterializer.service.js';

export function directorySelection(query, timezone, now = new Date()) {
  const wall = utcToZonedMysqlWall(now, timezone);
  const date = query.date ?? wall.slice(0, 10);
  const time = query.time ?? wall.slice(11, 16);
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)
    || !Number.isFinite(Date.parse(`${date}T00:00:00Z`))
    || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date
    || typeof time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    throw Object.assign(new Error('Choose a valid date and time.'), { status: 400 });
  }
  // One calendar day per read; future browsing never writes/materializes schedules.
  return { date, time, selectedAt: `${date} ${time}:00`, bounds: localDayUtcBounds(date, timezone) };
}

export function buildOfficeDirectory({ rooms, events, standing, plans, people, date, selectedAt, timezone }) {
  const peopleById = new Map(people.map(p => [Number(p.id), {
    id: Number(p.id), firstName: p.first_name, lastName: p.last_name,
    name: `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Provider',
    profilePhotoPath: p.profile_photo_path || null, agencyName: p.agency_name || null,
    agencySlug: p.agency_slug || null, agencyLogoPath: p.agency_logo_path || null
  }]));
  const person = id => peopleById.get(Number(id)) || null;
  const planByAssignment = new Map(plans.map(p => [Number(p.standing_assignment_id), p]));
  const dayEvents = [...events];
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  for (const assignment of standing) {
    if (Number(assignment.weekday) !== weekday || !isAssignmentActiveOnDate(assignment, date)) continue;
    const start = mysqlDateTimeForDateHour(date, assignment.hour, timezone);
    const end = mysqlDateTimeForDateHour(date, Number(assignment.hour) + 1, timezone);
    // Explicit events, cancellations and releases win over recurring defaults.
    // Subtract their intervals so a half-hour event doesn't erase the other half
    // of an assigned hour, and a canceled booking never reappears from its plan.
    let gaps = [[start, end]];
    for (const event of events.filter(e => Number(e.room_id) === Number(assignment.room_id))) {
      gaps = gaps.flatMap(([from, to]) => {
        if (event.end_at <= from || event.start_at >= to) return [[from, to]];
        const pieces = [];
        if (event.start_at > from) pieces.push([from, event.start_at]);
        if (event.end_at < to) pieces.push([event.end_at, to]);
        return pieces;
      });
    }
    const plan = planByAssignment.get(Number(assignment.id));
    const booked = plan && shouldBookOnDate(plan, assignment, date) && shouldBookByCount(plan, assignment, date);
    for (const [from, to] of gaps) dayEvents.push({ room_id: assignment.room_id, start_at: from, end_at: to,
      status: booked ? 'BOOKED' : 'RELEASED', slot_state: booked ? 'ASSIGNED_BOOKED' : 'ASSIGNED_AVAILABLE',
      assigned_provider_id: assignment.provider_id, booked_provider_id: booked ? assignment.provider_id : null });
  }
  return rooms.map(room => {
    const assignments = dayEvents.filter(e => Number(e.room_id) === Number(room.id) && e.status !== 'CANCELLED')
      .map(e => {
        const booked = e.status === 'BOOKED' || e.slot_state === 'ASSIGNED_BOOKED';
        const held = e.slot_state === 'COMPANY_HOLD';
        const assignedProvider = person(e.assigned_provider_id);
        const bookedProvider = booked ? person(e.booked_provider_id) : null;
        const startAt = utcToZonedMysqlWall(e.start_at, timezone);
        const endAt = utcToZonedMysqlWall(e.end_at, timezone);
        return { startAt, endAt, booked, held, assignedProvider, bookedProvider,
          status: endAt <= selectedAt ? 'finished' : startAt <= selectedAt ? 'current' : 'upcoming' };
      }).filter(a => a.booked || a.held || a.assignedProvider).sort((a,b) => a.startAt.localeCompare(b.startAt));
    const current = assignments.filter(a => a.status === 'current');
    return { id: room.id, name: room.name, roomNumber: room.room_number, assignments,
      occupied: current.some(a => a.booked || a.held), current };
  }).sort((a,b) => String(a.roomNumber ?? a.name).localeCompare(String(b.roomNumber ?? b.name), 'en', { numeric: true }));
}

export async function loadOfficeDirectory(db, location, query) {
  const timezone = location.timezone || 'America/Denver';
  const selection = directorySelection(query, timezone);
  const { bounds, date, time, selectedAt } = selection;
  const [[rooms], [events], [standing], [plans]] = await Promise.all([
    db.execute('SELECT id, name, room_number FROM office_rooms WHERE location_id = ? AND is_active = 1', [location.id]),
    db.execute(`SELECT room_id, DATE_FORMAT(start_at, '%Y-%m-%d %H:%i:%s') start_at,
      DATE_FORMAT(end_at, '%Y-%m-%d %H:%i:%s') end_at, status, slot_state, assigned_provider_id, booked_provider_id
      FROM office_events WHERE office_location_id = ? AND start_at < ? AND end_at > ?`, [location.id, bounds.endExclusive, bounds.startAt]),
    db.execute('SELECT * FROM office_standing_assignments WHERE office_location_id = ? AND is_active = 1', [location.id]),
    db.execute(`SELECT p.* FROM office_booking_plans p JOIN office_standing_assignments a ON a.id = p.standing_assignment_id
      WHERE a.office_location_id = ? AND a.is_active = 1 AND p.is_active = 1 ORDER BY p.id`, [location.id])
  ]);
  const ids = [...new Set([...events.flatMap(e => [e.assigned_provider_id, e.booked_provider_id]), ...standing.map(a => a.provider_id)].filter(Boolean))];
  let people = [];
  if (ids.length) [people] = await db.execute(`SELECT u.id, u.first_name, u.last_name, u.profile_photo_path,
    a.name agency_name, COALESCE(NULLIF(a.slug, ''), a.portal_url) agency_slug, COALESCE(NULLIF(a.logo_path, ''), NULLIF(a.logo_url, ''), ai.file_path) agency_logo_path
    FROM users u LEFT JOIN agencies a ON a.id = (
      SELECT ua.agency_id FROM user_agencies ua JOIN agencies candidate ON candidate.id = ua.agency_id
      WHERE ua.user_id = u.id AND ua.is_active = 1 AND candidate.organization_type = 'agency'
      ORDER BY (ua.agency_id = ?) DESC, ua.agency_id LIMIT 1)
    LEFT JOIN icons ai ON ai.id = a.icon_id
    WHERE u.id IN (${ids.map(() => '?').join(',')})`, [location.agency_id, ...ids]);
  return { locationId: location.id, locationName: location.name, timezone, date, time, selectedAt,
    rooms: buildOfficeDirectory({ rooms, events, standing, plans, people, date, selectedAt, timezone }) };
}
