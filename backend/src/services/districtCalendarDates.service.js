import pool from '../config/database.js';

export const DISTRICT_DATE_TYPES = ['school_holiday', 'school_day_off', 'school_first_day', 'school_fall_check_in', 'school_spring_event'];
export const isDistrictCalendarDate = (row) => row?.organization_id == null && !!row?.district_name && DISTRICT_DATE_TYPES.includes(row?.event_type);
const fail = (message, status = 400) => Object.assign(new Error(message), { status });

function fields(input, existing = {}) {
  const title = String(input.title ?? existing.title ?? '').trim();
  const eventType = input.eventType ?? existing.event_type;
  const start = new Date(input.startsAt ?? existing.starts_at);
  const end = new Date(input.endsAt ?? existing.ends_at);
  if (!title) throw fail('Title is required');
  if (!DISTRICT_DATE_TYPES.includes(eventType)) throw fail('District important dates must use a calendar-only type');
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) throw fail('End date must be after start date');
  const timezone = input.timezone || existing.timezone || 'America/Denver';
  try { new Intl.DateTimeFormat('en-US', { timeZone: timezone }); } catch { throw fail('Invalid timezone'); }
  const status = input.schoolEventStatus ?? existing.school_event_status ?? 'scheduled';
  if (!['scheduled', 'rescheduled', 'canceled'].includes(status)) throw fail('Invalid calendar status');
  const detailsUrl = input.detailsUrl === undefined ? existing.details_url || null : input.detailsUrl;
  if (detailsUrl) {
    try { if (!['http:', 'https:'].includes(new URL(detailsUrl).protocol)) throw new Error(); } catch { throw fail('Details link must be an HTTP or HTTPS URL'); }
  }
  return [title, String(input.description ?? existing.description ?? '').trim() || null, eventType, start, end, timezone, detailsUrl, status];
}

export async function createDistrictCalendarDate(input) {
  const values = fields(input);
  const [result] = await pool.execute(
    `INSERT INTO company_events
      (agency_id, organization_id, created_by_user_id, updated_by_user_id,
       district_name, district_broadcast_id, title, description, event_type, starts_at, ends_at,
       timezone, details_url, school_event_status, is_active, rsvp_mode, outreach_table_invited, staffing_config_json)
     VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'none', 0, ?)`,
    [input.agencyId, input.userId, input.userId, input.districtName.trim(), input.districtBroadcastId,
      ...values, JSON.stringify({ enabled: false, providerSignupEnabled: false })]
  );
  const [rows] = await pool.execute('SELECT * FROM company_events WHERE id = ? LIMIT 1', [result.insertId]);
  return rows[0];
}

export async function updateDistrictCalendarDate(input) {
  const [rows] = await pool.execute('SELECT * FROM company_events WHERE id = ? AND agency_id = ? AND organization_id IS NULL AND is_active = 1 LIMIT 1', [input.eventId, input.agencyId]);
  const existing = rows[0];
  if (!isDistrictCalendarDate(existing)) throw fail('District important date not found', 404);
  const values = fields(input, existing);
  await pool.execute(
    `UPDATE company_events SET title = ?, description = ?, event_type = ?, starts_at = ?, ends_at = ?,
       timezone = ?, details_url = ?, school_event_status = ?, updated_by_user_id = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND agency_id = ? AND organization_id IS NULL`,
    [...values, input.userId, input.eventId, input.agencyId]
  );
  const [updated] = await pool.execute('SELECT * FROM company_events WHERE id = ? AND agency_id = ?', [input.eventId, input.agencyId]);
  return updated[0];
}

export async function deleteDistrictCalendarDate({ eventId, agencyId, userId }) {
  const [rows] = await pool.execute('SELECT * FROM company_events WHERE id = ? AND agency_id = ? AND organization_id IS NULL AND is_active = 1 LIMIT 1', [eventId, agencyId]);
  if (!isDistrictCalendarDate(rows[0])) throw fail('District important date not found', 404);
  await pool.execute("UPDATE company_events SET is_active = 0, school_event_status = 'canceled', updated_by_user_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND agency_id = ? AND organization_id IS NULL", [userId, eventId, agencyId]);
  return { id: eventId, deleted: true, deletedCount: 1 };
}

// One shared row, scoped by both agency affiliation and the school's current district.
export async function listDistrictCalendarDatesForSchool({ agencyId, organizationId }) {
  if (!agencyId) return [];
  const [rows] = await pool.execute(
    `SELECT ce.* FROM company_events ce
     WHERE ce.agency_id = ? AND ce.organization_id IS NULL AND ce.is_active = 1
       AND ce.event_type IN (${DISTRICT_DATE_TYPES.map(() => '?').join(', ')})
       AND EXISTS (SELECT 1 FROM school_profiles sp WHERE sp.school_organization_id = ?
         AND LOWER(TRIM(sp.district_name)) = LOWER(TRIM(ce.district_name)))`,
    [agencyId, ...DISTRICT_DATE_TYPES, organizationId]
  );
  return rows;
}
