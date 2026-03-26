import { isValidTimeZone, zonedWallTimeToUtc } from '../utils/zonedWallTime.util.js';

/**
 * Resolve Skill Builders program org under an agency (affiliated program named "Skill Builders").
 */
export async function resolveSkillBuildersProgramOrganizationId(conn, agencyId) {
  const aid = Number(agencyId);
  if (!Number.isFinite(aid) || aid <= 0) return null;
  const [rows] = await conn.execute(
    `SELECT child.id
     FROM organization_affiliations oa
     JOIN agencies child ON child.id = oa.organization_id
     WHERE oa.agency_id = ?
       AND oa.is_active = TRUE
       AND (child.is_archived = FALSE OR child.is_archived IS NULL)
       AND (child.is_active = TRUE OR child.is_active IS NULL)
       AND LOWER(COALESCE(child.organization_type, '')) = 'program'
       AND LOWER(TRIM(child.name)) = 'skill builders'
     ORDER BY child.id ASC
     LIMIT 1`,
    [aid]
  );
  return rows?.[0]?.id ? Number(rows[0].id) : null;
}

/**
 * All active affiliated program organizations under an agency (any program name).
 * Public marketing hubs use this so listed events are not limited to a program literally named "Skill Builders".
 */
export async function listAffiliatedProgramOrganizationIds(conn, agencyId) {
  const aid = Number(agencyId);
  if (!Number.isFinite(aid) || aid <= 0) return [];
  const [rows] = await conn.execute(
    `SELECT child.id
     FROM organization_affiliations oa
     JOIN agencies child ON child.id = oa.organization_id
     WHERE oa.agency_id = ?
       AND oa.is_active = TRUE
       AND (child.is_archived = FALSE OR child.is_archived IS NULL)
       AND (child.is_active = TRUE OR child.is_active IS NULL)
       AND LOWER(COALESCE(child.organization_type, '')) = 'program'
     ORDER BY child.id ASC`,
    [aid]
  );
  return (rows || []).map((r) => Number(r.id)).filter((n) => Number.isFinite(n) && n > 0);
}

/**
 * Affiliated program-type organizations under an agency (id, name, portal slug).
 * Used for public /enroll discovery and admin tooling.
 */
export async function listAffiliatedProgramOrganizations(conn, agencyId) {
  const aid = Number(agencyId);
  if (!Number.isFinite(aid) || aid <= 0) return [];
  const [rows] = await conn.execute(
    `SELECT child.id, child.name, child.slug
     FROM organization_affiliations oa
     JOIN agencies child ON child.id = oa.organization_id
     WHERE oa.agency_id = ?
       AND oa.is_active = TRUE
       AND (child.is_archived = FALSE OR child.is_archived IS NULL)
       AND (child.is_active = TRUE OR child.is_active IS NULL)
       AND LOWER(COALESCE(child.organization_type, '')) = 'program'
     ORDER BY child.name ASC, child.id ASC`,
    [aid]
  );
  return (rows || [])
    .map((r) => ({
      id: Number(r.id),
      name: String(r.name || '').trim() || 'Program',
      slug: String(r.slug || '')
        .trim()
        .toLowerCase()
    }))
    .filter((p) => p.slug && Number.isFinite(p.id) && p.id > 0);
}

/**
 * Resolve an affiliated program organization under an agency by its portal slug (agencies.slug).
 */
export async function resolveAffiliatedProgramOrganizationIdBySlug(conn, agencyId, programSlug) {
  const aid = Number(agencyId);
  const slug = String(programSlug || '')
    .trim()
    .toLowerCase();
  if (!Number.isFinite(aid) || aid <= 0 || !slug) return null;
  const [rows] = await conn.execute(
    `SELECT child.id
     FROM organization_affiliations oa
     JOIN agencies child ON child.id = oa.organization_id
     WHERE oa.agency_id = ?
       AND oa.is_active = TRUE
       AND (child.is_archived = FALSE OR child.is_archived IS NULL)
       AND (child.is_active = TRUE OR child.is_active IS NULL)
       AND LOWER(COALESCE(child.organization_type, '')) = 'program'
       AND LOWER(TRIM(child.slug)) = ?
     ORDER BY child.id ASC
     LIMIT 1`,
    [aid, slug]
  );
  return rows?.[0]?.id ? Number(rows[0].id) : null;
}

/**
 * Resolve a program organization by portal slug under any active parent affiliation.
 * Used when the URL’s first segment is the program’s own slug (multi-parent safe).
 */
export async function resolveAffiliatedProgramOrganizationIdBySlugAnyParent(conn, programSlug) {
  const slug = String(programSlug || '')
    .trim()
    .toLowerCase();
  if (!slug) return null;
  const [rows] = await conn.execute(
    `SELECT child.id
     FROM organization_affiliations oa
     JOIN agencies child ON child.id = oa.organization_id
     WHERE oa.is_active = TRUE
       AND (child.is_archived = FALSE OR child.is_archived IS NULL)
       AND (child.is_active = TRUE OR child.is_active IS NULL)
       AND LOWER(COALESCE(child.organization_type, '')) = 'program'
       AND LOWER(TRIM(child.slug)) = ?
     ORDER BY child.id ASC
     LIMIT 1`,
    [slug]
  );
  return rows?.[0]?.id ? Number(rows[0].id) : null;
}

/**
 * Skills group DATE columns may be NULL, or MySQL zero dates (0000-00-00) which must not be sent to company_events.
 * @returns {string|null} YYYY-MM-DD or null
 */
export function normalizeSkillsGroupYmd(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) return null;
    const y = value.getUTCFullYear();
    if (!Number.isFinite(y) || y < 1) return null;
    const m = String(value.getUTCMonth() + 1).padStart(2, '0');
    const d = String(value.getUTCDate()).padStart(2, '0');
    const s = `${y}-${m}-${d}`;
    if (s.startsWith('0000-')) return null;
    return s;
  }
  const s = String(value).trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  if (s.startsWith('0000-')) return null;
  const dt = new Date(`${s}T12:00:00.000Z`);
  if (!Number.isFinite(dt.getTime())) return null;
  return s;
}

function meetingSummaryLines(meetings) {
  if (!Array.isArray(meetings) || !meetings.length) return '';
  return meetings
    .map((m) => {
      const st = String(m.start_time || '').slice(0, 8);
      const et = String(m.end_time || '').slice(0, 8);
      return `${m.weekday} ${st}–${et}`;
    })
    .join('\n');
}

export function buildSkillsGroupEventDescription({ schoolName, groupName, startDate, endDate, meetings }) {
  const start = normalizeSkillsGroupYmd(startDate);
  const end = normalizeSkillsGroupYmd(endDate);
  const parts = [
    `Integrated Skill Builders skills group at ${schoolName}.`,
    start && end ? `Runs ${start} through ${end}.` : 'Date range not set on the skills group.',
    meetingSummaryLines(meetings) ? `Meetings:\n${meetingSummaryLines(meetings)}` : ''
  ];
  return parts.filter(Boolean).join('\n\n');
}

/**
 * @param {string|Date|null|undefined} startDate - skills_groups.start_date
 * @param {string|Date|null|undefined} endDate - skills_groups.end_date
 * @param {string} [timeZone] - IANA zone (agency office); defaults to America/New_York
 * @returns {{ startsAt: Date, endsAt: Date, timeZone: string }}
 */
export function computeSkillsGroupEventWindow(startDate, endDate, timeZone = 'America/New_York') {
  const tz = isValidTimeZone(timeZone) ? String(timeZone).trim() : 'America/New_York';
  const start = normalizeSkillsGroupYmd(startDate);
  const end = normalizeSkillsGroupYmd(endDate);
  if (start && end) {
    const [ys, ms, ds] = start.split('-').map((x) => Number(x));
    const [ye, me, de] = end.split('-').map((x) => Number(x));
    const startsAt = zonedWallTimeToUtc({
      year: ys,
      month: ms,
      day: ds,
      hour: 0,
      minute: 0,
      second: 0,
      timeZone: tz
    });
    const endsAt = zonedWallTimeToUtc({
      year: ye,
      month: me,
      day: de,
      hour: 23,
      minute: 59,
      second: 59,
      timeZone: tz
    });
    if (
      Number.isFinite(startsAt.getTime()) &&
      Number.isFinite(endsAt.getTime()) &&
      endsAt.getTime() >= startsAt.getTime()
    ) {
      return { startsAt, endsAt, timeZone: tz };
    }
  }
  const startsAt = new Date();
  const endsAt = new Date(Date.now() + 86400000);
  return { startsAt, endsAt, timeZone: tz };
}

const CE_INSERT_SQL = `INSERT INTO company_events
  (agency_id, organization_id, created_by_user_id, updated_by_user_id, title, description, event_type, splash_content,
   starts_at, ends_at, timezone, recurrence_json, is_active, rsvp_mode, voting_config_json, reminder_config_json, voting_closed_at, sms_code)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

const EMPTY_VOTE = JSON.stringify({ enabled: false, viaSms: false, question: '', options: [] });
const EMPTY_REMINDER = JSON.stringify({ enabled: false, offsetsHours: [24, 2], channels: { inApp: true, sms: false } });
const NONE_RECURRENCE = JSON.stringify({ frequency: 'none' });

export async function insertSkillsGroupCompanyEvent(conn, params) {
  const {
    agencyId,
    programOrgId,
    userId,
    title,
    description,
    startsAt,
    endsAt,
    timeZone
  } = params;
  const tz =
    timeZone != null && isValidTimeZone(timeZone) ? String(timeZone).trim() : 'America/New_York';
  const [ins] = await conn.execute(CE_INSERT_SQL, [
    agencyId,
    programOrgId,
    userId,
    userId,
    String(title || '').slice(0, 255),
    description || null,
    'skills_group',
    null,
    startsAt,
    endsAt,
    tz,
    NONE_RECURRENCE,
    1,
    'none',
    EMPTY_VOTE,
    EMPTY_REMINDER,
    null,
    null
  ]);
  return Number(ins.insertId);
}

export async function updateSkillsGroupCompanyEvent(conn, eventId, params) {
  const { title, description, startsAt, endsAt, programOrgId, userId, timeZone } = params;
  const t = String(title || '').slice(0, 255);
  const pid = programOrgId != null ? Number(programOrgId) : null;
  const tz =
    timeZone != null && isValidTimeZone(timeZone) ? String(timeZone).trim() : null;
  if (pid != null && Number.isFinite(pid) && pid > 0) {
    if (tz) {
      await conn.execute(
        `UPDATE company_events
         SET updated_by_user_id = ?, organization_id = ?, title = ?, description = ?, starts_at = ?, ends_at = ?, timezone = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [userId, pid, t, description || null, startsAt, endsAt, tz, eventId]
      );
    } else {
      await conn.execute(
        `UPDATE company_events
         SET updated_by_user_id = ?, organization_id = ?, title = ?, description = ?, starts_at = ?, ends_at = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [userId, pid, t, description || null, startsAt, endsAt, eventId]
      );
    }
  } else if (tz) {
    await conn.execute(
      `UPDATE company_events
       SET updated_by_user_id = ?, title = ?, description = ?, starts_at = ?, ends_at = ?, timezone = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [userId, t, description || null, startsAt, endsAt, tz, eventId]
    );
  } else {
    await conn.execute(
      `UPDATE company_events
       SET updated_by_user_id = ?, title = ?, description = ?, starts_at = ?, ends_at = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [userId, t, description || null, startsAt, endsAt, eventId]
    );
  }
}

export async function deactivateSkillsGroupCompanyEvent(conn, eventId, userId) {
  if (!eventId) return;
  await conn.execute(
    `UPDATE company_events SET is_active = 0, updated_by_user_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [userId, eventId]
  );
}
