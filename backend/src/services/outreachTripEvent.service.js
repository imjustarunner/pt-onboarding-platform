import crypto from 'node:crypto';
import { EVENT_STAFF_ROLES_SQL } from '../utils/companyEventOperations.js';
import { zonedWallTimeToUtc, isValidTimeZone } from '../utils/zonedWallTime.util.js';
import { isPlaceholderOutreachAddress } from '../utils/outreachHubPure.js';

const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
export const readOutreachEventConfig = raw => {
  if (typeof raw === 'string') { try { return JSON.parse(raw); } catch { return { enabled: false }; } }
  return raw || { enabled: false };
};
const dateOnly = raw => raw instanceof Date ? raw.toISOString().slice(0, 10) : String(raw || '').slice(0, 10);

export function normalizeOutreachEventConfig(raw, plannedDate) {
  const value = readOutreachEventConfig(raw);
  if (typeof value.enabled !== 'boolean') fail(400, 'Assign as Outreach Event must be a checkbox value');
  if (!value.enabled) return { enabled: false };
  const ids = value.assigneeUserIds;
  if (!Array.isArray(ids) || !ids.length || ids.length > 50 || ids.some(id => !Number.isSafeInteger(Number(id)) || Number(id) <= 0)) fail(400, 'Choose at least one employee for the Outreach Event');
  const day = dateOnly(plannedDate);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(Date.parse(`${day}T12:00:00Z`)) || new Date(`${day}T12:00:00Z`).toISOString().slice(0, 10) !== day) fail(400, 'Choose a valid trip date for the Outreach Event');
  if (![value.startTime, value.endTime].every(t => typeof t === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(t)) || value.endTime <= value.startTime) fail(400, 'Outreach Event end time must be after its start time on the trip date');
  const timezone = value.timezone || 'America/Denver';
  if (!isValidTimeZone(timezone)) fail(400, 'Choose a valid Outreach Event timezone');
  return { enabled: true, assigneeUserIds: [...new Set(ids.map(Number))].sort((a,b) => a-b), startTime: value.startTime, endTime: value.endTime, timezone };
}

export async function assertOutreachTripActor(db, agencyId, userId) {
  const [rows] = await db.execute(`SELECT u.id FROM users u
    WHERE u.id = ? AND u.is_active = 1 AND COALESCE(u.is_archived, 0) = 0 AND u.terminated_at IS NULL
      AND (LOWER(u.role) IN ('super_admin', 'admin', 'support') OR u.has_outreach_access = 1)
      AND (LOWER(u.role) = 'super_admin' OR EXISTS (SELECT 1 FROM user_agencies ua
        WHERE ua.user_id = u.id AND ua.agency_id = ? AND COALESCE(ua.is_active, 1) = 1))`, [userId, agencyId]);
  if (!rows.length) fail(403, 'Outreach Hub access to this agency is required');
}

export async function listOutreachEventAssignableUsers(agencyId, db) {
  const [rows] = await db.execute(`SELECT DISTINCT u.id, u.first_name, u.last_name, u.email
    FROM users u JOIN user_agencies ua ON ua.user_id = u.id AND ua.agency_id = ? AND COALESCE(ua.is_active, 1) = 1
    WHERE u.is_active = 1 AND COALESCE(u.is_archived, 0) = 0 AND u.terminated_at IS NULL
      AND LOWER(u.role) IN (${EVENT_STAFF_ROLES_SQL})
      AND UPPER(COALESCE(u.status, '')) NOT IN ('ARCHIVED', 'INACTIVE', 'INACTIVE_EMPLOYEE', 'TERMINATED', 'TERMINATED_PENDING', 'PROSPECTIVE', 'PENDING_SETUP', 'PREHIRE_OPEN')
    ORDER BY u.last_name, u.first_name, u.id`, [agencyId]);
  return rows;
}

const eventInstant = (day, time, timezone) => {
  const [year, month, date] = dateOnly(day).split('-').map(Number), [hour, minute] = time.split(':').map(Number);
  return zonedWallTimeToUtc({ year, month, day: date, hour, minute, timeZone: timezone });
};
const signature = trip => {
  const value = readOutreachEventConfig(trip?.outreachEvent);
  // MySQL JSON may reorder object keys. Compare scheduling values, not serialized key order.
  const config = value.enabled ? [true, [...(value.assigneeUserIds || [])].map(Number).sort((a,b) => a-b), value.startTime, value.endTime, value.timezone || 'America/Denver'] : [false];
  return JSON.stringify({ date: dateOnly(trip?.planned_date), config,
    stops: (trip?.stops || []).map(s => [Number(s.outreach_school_id), s.address]) });
};

export async function assertOutreachEventUnused(db, eventId) {
  if (!eventId) return;
  const [rows] = await db.execute(`SELECT 1 FROM skill_builders_event_kiosk_punches WHERE company_event_id = ?
    UNION ALL SELECT 1 FROM company_event_travel_reports WHERE company_event_id = ?
    UNION ALL SELECT 1 FROM payroll_time_claims WHERE JSON_UNQUOTE(JSON_EXTRACT(payload_json, '$.companyEventId')) = ?
      AND status IN ('submitted', 'approved', 'paid', 'deferred') LIMIT 1`, [eventId, eventId, String(eventId)]);
  if (rows.length) fail(409, 'This Outreach Event has attendance or a travel/payroll report. Keep its date, route and assignments; create a new trip for additional work.');
}

/** Called inside the trip transaction, after locking its row. Never pays from a planned route. */
export async function syncOutreachTripEvent(db, agencyId, trip, actorUserId, previousTrip = null) {
  const config = normalizeOutreachEventConfig(trip.outreachEvent || { enabled: false }, trip.planned_date);
  let eventId = Number(trip.company_event_id) || null;
  const assignmentChanged = (!eventId && config.enabled) || (eventId && (signature(previousTrip) !== signature({ ...trip, outreachEvent: config }) || trip.status === 'cancelled'));
  if (assignmentChanged) {
    const [actors] = await db.execute('SELECT role FROM users WHERE id = ?', [actorUserId]);
    if (!['admin','super_admin','support','staff'].includes(String(actors[0]?.role || '').toLowerCase())) fail(403, 'An admin or outreach staff coordinator must assign or change an Outreach Event. You can save an unassigned trip for them to review.');
  }
  if (eventId) {
    await db.execute('SELECT id FROM company_events WHERE id = ? AND agency_id = ? FOR UPDATE', [eventId, agencyId]);
    if (signature(previousTrip) !== signature({ ...trip, outreachEvent: config })) await assertOutreachEventUnused(db, eventId);
  }
  if (!config.enabled || trip.status === 'cancelled') {
    if (eventId) {
      await assertOutreachEventUnused(db, eventId);
      await db.execute("UPDATE company_events SET is_active = 0, school_event_status = 'canceled', updated_by_user_id = ? WHERE id = ? AND agency_id = ?", [actorUserId, eventId, agencyId]);
      await db.execute('DELETE FROM company_event_provider_assignments WHERE company_event_id = ?', [eventId]);
      await db.execute('DELETE FROM company_event_audiences WHERE company_event_id = ?', [eventId]);
    }
    return eventId;
  }
  const eligible = new Set((await listOutreachEventAssignableUsers(agencyId, db)).map(u => Number(u.id)));
  if (config.assigneeUserIds.some(id => !eligible.has(id))) fail(400, 'Every Outreach Event assignee must be an active employee in this agency');
  if (!trip.stops?.length || trip.stops.some(s => !s.address || isPlaceholderOutreachAddress({ ...s, name: s.school_name || s.name }))) fail(400, 'Save a street address for every school stop before assigning an Outreach Event');
  const startsAt = eventInstant(trip.planned_date, config.startTime, config.timezone);
  const endsAt = eventInstant(trip.planned_date, config.endTime, config.timezone);
  const title = `Outreach Event · ${trip.title}`.slice(0, 255);
  const description = ['Assigned school outreach: new relationships or maintaining existing school relationships.',
    ...trip.stops.map((stop, index) => `${index + 1}. ${stop.school_name || stop.name} — ${stop.address}`),
    'Check in and out for actual outreach work at each stop. Check out while driving; submit travel separately in the event travel form.',
    'School contacts and visit notes are available in Outreach Hub.'].join('\n');
  if (!eventId) {
    const [result] = await db.execute(`INSERT INTO company_events
      (agency_id, created_by_user_id, updated_by_user_id, title, description, event_type, starts_at, ends_at, timezone,
       is_active, school_event_status, event_location_name, event_location_address, rsvp_mode, operations_json, staff_link_token)
      VALUES (?, ?, ?, ?, ?, 'school_outreach', ?, ?, ?, 1, 'scheduled', ?, ?, 'none', ?, ?)`,
    [agencyId, actorUserId, actorUserId, title, description, startsAt, endsAt, config.timezone,
      trip.stops[0].school_name || trip.stops[0].name, trip.stops[0].address,
      JSON.stringify({ outreachTripId: Number(trip.id), staffAudienceScope: 'audience', publicRegistrationEnabled: false, countsTowardOutreachCommitment: true }), crypto.randomBytes(24).toString('hex')]);
    eventId = Number(result.insertId);
    await db.execute('UPDATE outreach_trips SET company_event_id = ? WHERE id = ? AND agency_id = ?', [eventId, trip.id, agencyId]);
  } else {
    await db.execute(`UPDATE company_events SET title = ?, description = ?, starts_at = ?, ends_at = ?, timezone = ?,
      event_location_name = ?, event_location_address = ?, is_active = 1, school_event_status = 'scheduled', updated_by_user_id = ?
      WHERE id = ? AND agency_id = ?`, [title, description, startsAt, endsAt, config.timezone, trip.stops[0].school_name || trip.stops[0].name, trip.stops[0].address, actorUserId, eventId, agencyId]);
  }
  const placeholders = config.assigneeUserIds.map(() => '?').join(',');
  await db.execute(`DELETE FROM company_event_provider_assignments WHERE company_event_id = ? AND provider_user_id NOT IN (${placeholders})`, [eventId, ...config.assigneeUserIds]);
  await db.execute(`DELETE FROM company_event_audiences WHERE company_event_id = ? AND (audience_type != 'user' OR target_id NOT IN (${placeholders}))`, [eventId, ...config.assigneeUserIds]);
  for (const uid of config.assigneeUserIds) {
    await db.execute(`INSERT INTO company_event_provider_assignments (company_event_id, provider_user_id, role_title, role_key)
      VALUES (?, ?, 'Outreach', 'outreach') ON DUPLICATE KEY UPDATE role_title = VALUES(role_title)`, [eventId, uid]);
    await db.execute("INSERT IGNORE INTO company_event_audiences (company_event_id, audience_type, target_id) VALUES (?, 'user', ?)", [eventId, uid]);
  }
  return eventId;
}
