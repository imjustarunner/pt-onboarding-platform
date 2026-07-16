import crypto from 'crypto';
import pool from '../config/database.js';
import OrganizationAffiliation from '../models/OrganizationAffiliation.model.js';
import AgencySchool from '../models/AgencySchool.model.js';
import ProviderAvailabilityService from './providerAvailability.service.js';
import { materializeSessionsForEvent } from './companyEventSessionDates.service.js';

export const SCHOOL_PORTAL_EVENT_TYPES = new Set([
  'school_back_to_school',
  'school_spring_event',
  'school_open_house',
  'school_resource_fair',
  'school_family_night',
  'school_orientation',
  'school_other'
]);

/** Categories that enforce one active event per school per calendar year. */
export const YEARLY_UNIQUE_SCHOOL_EVENT_CATEGORIES = new Set(['back_to_school', 'spring']);

export const SCHOOL_EVENT_CATEGORIES = [
  'back_to_school',
  'spring',
  'open_house',
  'resource_fair',
  'family_night',
  'orientation',
  'other'
];

/** Lifecycle for school portal events (shown in UI + drives banner copy). */
export const SCHOOL_EVENT_STATUSES = new Set(['scheduled', 'rescheduled', 'canceled']);

export function normalizeSchoolEventStatus(raw, { fallback = 'scheduled' } = {}) {
  const s = String(raw || '').trim().toLowerCase();
  if (s === 'cancelled') return 'canceled';
  if (SCHOOL_EVENT_STATUSES.has(s)) return s;
  return fallback;
}

export function categoryToEventType(category) {
  const c = String(category || '').trim().toLowerCase();
  if (c === 'back_to_school') return 'school_back_to_school';
  if (c === 'spring') return 'school_spring_event';
  if (c === 'open_house') return 'school_open_house';
  if (c === 'resource_fair') return 'school_resource_fair';
  if (c === 'family_night') return 'school_family_night';
  if (c === 'orientation') return 'school_orientation';
  if (c === 'other') return 'school_other';
  return null;
}

export function eventTypeToCategory(eventType) {
  const t = String(eventType || '').trim().toLowerCase();
  if (t === 'school_back_to_school') return 'back_to_school';
  if (t === 'school_spring_event') return 'spring';
  if (t === 'school_open_house') return 'open_house';
  if (t === 'school_resource_fair') return 'resource_fair';
  if (t === 'school_family_night') return 'family_night';
  if (t === 'school_orientation') return 'orientation';
  if (t === 'school_other') return 'other';
  return null;
}

export function isSchoolPortalEventType(eventType) {
  return SCHOOL_PORTAL_EVENT_TYPES.has(String(eventType || '').trim().toLowerCase());
}

export async function resolveAgencyIdForSchoolOrg(schoolOrganizationId) {
  const orgId = Number(schoolOrganizationId);
  if (!orgId) return null;
  return (
    (await OrganizationAffiliation.getActiveAgencyIdForOrganization(orgId)) ||
    (await AgencySchool.getActiveAgencyIdForSchool(orgId)) ||
    null
  );
}

export function currentCalendarYear(date = new Date()) {
  return date.getFullYear();
}

export async function findExistingSchoolEventForYear({ organizationId, eventType, year, excludeEventId = null }) {
  const orgId = Number(organizationId);
  const et = String(eventType || '').trim();
  const y = Number(year);
  if (!orgId || !et || !Number.isFinite(y)) return null;
  const params = [orgId, et, y];
  let excludeSql = '';
  if (excludeEventId) {
    excludeSql = ' AND id <> ?';
    params.push(Number(excludeEventId));
  }
  const [rows] = await pool.execute(
    `SELECT id, title, starts_at, ends_at
     FROM company_events
     WHERE organization_id = ?
       AND event_type = ?
       AND is_active = 1
       AND YEAR(starts_at) = ?
       ${excludeSql}
     LIMIT 1`,
    params
  );
  return rows?.[0] || null;
}

export function buildSchoolEventStaffingConfig({ minProvidersPerSession = 1 } = {}) {
  return {
    enabled: true,
    minProvidersPerSession: Math.max(1, Number(minProvidersPerSession) || 1),
    clientRule: { enabled: false, confirmedStepSize: 1, additionalProvidersPerStep: 0, threshold: null },
    groupRule: { enabled: false, baseProvidersForOneGroup: 0, additionalProvidersPerGroup: 0 },
    onCall: { enabled: false, leadHours: 0 },
    waitlist: { enabled: false },
    providerSignup: { enabled: true }
  };
}

/** @deprecated use buildSchoolEventStaffingConfig */
function buildOutreachStaffingConfig() {
  return buildSchoolEventStaffingConfig();
}

/**
 * Enable provider apply/assign staffing on a school company_event and materialize sessions.
 * Used by Caseload Hub so events are staffable even if posted without outreach checkbox.
 */
export async function enableSchoolEventProviderStaffing({
  eventId,
  agencyId,
  userId,
  minProvidersPerSession = 1
}) {
  const eid = Number(eventId);
  const aid = Number(agencyId);
  if (!eid || !aid) throw Object.assign(new Error('eventId and agencyId are required'), { status: 400 });

  const [rows] = await pool.execute(
    `SELECT id, event_type, organization_id, staffing_config_json, outreach_table_invited
     FROM company_events
     WHERE id = ? AND agency_id = ?
     LIMIT 1`,
    [eid, aid]
  );
  const row = rows?.[0];
  if (!row) throw Object.assign(new Error('Event not found'), { status: 404 });
  if (!isSchoolPortalEventType(row.event_type)) {
    throw Object.assign(new Error('Not a school portal event'), { status: 400 });
  }

  const staffingConfig = buildSchoolEventStaffingConfig({ minProvidersPerSession });
  await pool.execute(
    `UPDATE company_events
     SET staffing_config_json = ?,
         updated_by_user_id = ?
     WHERE id = ? AND agency_id = ?`,
    [JSON.stringify(staffingConfig), userId || null, eid, aid]
  );
  await materializeSessionsForEvent(pool, { companyEventId: eid });

  const [next] = await pool.execute('SELECT * FROM company_events WHERE id = ? LIMIT 1', [eid]);
  const schoolMeta = await loadSchoolMeta(row.organization_id);
  return mapSchoolEventRow(next?.[0], schoolMeta);
}

export function mapSchoolEventRow(row, schoolMeta = {}) {
  if (!row) return null;
  const eventType = String(row.event_type || '').trim();
  return {
    id: Number(row.id),
    agencyId: Number(row.agency_id),
    organizationId: row.organization_id != null ? Number(row.organization_id) : null,
    title: row.title || '',
    description: row.description || '',
    eventType,
    category: eventTypeToCategory(eventType),
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    timezone: row.timezone || 'UTC',
    isActive: !!(row.is_active === 1 || row.is_active === true),
    outreachTableInvited: !!(row.outreach_table_invited === 1 || row.outreach_table_invited === true),
    eventImageUrl: row.event_image_url ? String(row.event_image_url).trim() : '',
    flierFileUrl: row.flier_file_url ? String(row.flier_file_url).trim() : '',
    schoolEventStatus: normalizeSchoolEventStatus(row.school_event_status, {
      fallback: row.is_active ? 'scheduled' : 'canceled'
    }),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    schoolName: schoolMeta.name || null,
    schoolSlug: schoolMeta.slug || null
  };
}

function categoryLabel(category) {
  const map = {
    back_to_school: 'Back to School',
    spring: 'Spring Event',
    open_house: 'Open House',
    resource_fair: 'Resource Fair',
    family_night: 'Family Night',
    orientation: 'Orientation',
    other: 'School Event'
  };
  return map[String(category || '')] || 'School Event';
}

function formatEventWhenForBanner(startsAt, timezone) {
  const d = startsAt instanceof Date ? startsAt : new Date(startsAt);
  if (!Number.isFinite(d.getTime())) return '';
  const tz = String(timezone || 'America/Denver').trim() || 'America/Denver';
  try {
    return d.toLocaleString('en-US', {
      timeZone: tz,
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  } catch {
    return d.toLocaleString();
  }
}

/** Monday 00:00 local-ish of the event week through end of event day (capped at 14 days for announcement rules). */
function announcementWindowForEvent(startsAt, timezone) {
  const start = startsAt instanceof Date ? startsAt : new Date(startsAt);
  if (!Number.isFinite(start.getTime())) return null;
  const tz = String(timezone || 'America/Denver').trim() || 'America/Denver';

  // Derive calendar Y-M-D in event timezone
  let y;
  let m;
  let day;
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(start);
    const get = (t) => parts.find((p) => p.type === t)?.value;
    y = Number(get('year'));
    m = Number(get('month'));
    day = Number(get('day'));
  } catch {
    y = start.getUTCFullYear();
    m = start.getUTCMonth() + 1;
    day = start.getUTCDate();
  }

  // Approximate Monday of that week using UTC noon anchor for the local calendar day
  const noonUtc = new Date(Date.UTC(y, m - 1, day, 12, 0, 0));
  const dow = noonUtc.getUTCDay(); // 0 Sun … 6 Sat
  const daysFromMonday = dow === 0 ? 6 : dow - 1;
  const monday = new Date(noonUtc);
  monday.setUTCDate(monday.getUTCDate() - daysFromMonday);
  monday.setUTCHours(0, 0, 0, 0);

  const endOfDay = new Date(Date.UTC(y, m - 1, day, 23, 59, 59, 999));
  // Ensure window is at least a few hours and within 14 days
  let ends = endOfDay;
  if (ends.getTime() <= monday.getTime()) {
    ends = new Date(monday.getTime() + 24 * 60 * 60 * 1000 - 1);
  }
  const maxEnd = new Date(monday.getTime() + 14 * 24 * 60 * 60 * 1000 - 1);
  if (ends.getTime() > maxEnd.getTime()) ends = maxEnd;

  return { startsAt: monday, endsAt: ends };
}

/**
 * Upsert a scrolling school-portal announcement for this event
 * (week of the event through the event day).
 */
export async function syncSchoolEventAnnouncement({
  organizationId,
  companyEventId,
  userId,
  title,
  category,
  startsAt,
  timezone,
  schoolEventStatus
}) {
  const orgId = Number(organizationId);
  const eventId = Number(companyEventId);
  if (!orgId || !eventId) return null;

  const status = normalizeSchoolEventStatus(schoolEventStatus);
  const when = formatEventWhenForBanner(startsAt, timezone);
  const typeLabel = categoryLabel(category);

  let message;
  let titleOut;
  if (status === 'canceled') {
    titleOut = 'Event canceled';
    message = `${title || typeLabel} has been canceled${when ? ` (was ${when})` : ''}.`;
  } else if (status === 'rescheduled') {
    titleOut = 'Event rescheduled';
    message = `${title || typeLabel} has been rescheduled to ${when || 'a new date/time'}.`;
  } else {
    titleOut = typeLabel;
    message = `${title || typeLabel} — ${when || 'upcoming'}. Providers can apply to staff this event.`;
  }

  // End any prior linked banner immediately when canceled (still leave a short notice window)
  const window = announcementWindowForEvent(startsAt, timezone);
  if (!window) return null;

  let startsAtAnn = window.startsAt;
  let endsAtAnn = window.endsAt;
  if (status === 'canceled') {
    startsAtAnn = new Date();
    endsAtAnn = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
  }

  try {
    const [existing] = await pool.execute(
      `SELECT id FROM school_portal_announcements
       WHERE organization_id = ? AND company_event_id = ?
       ORDER BY id DESC LIMIT 1`,
      [orgId, eventId]
    );
    if (existing?.[0]?.id) {
      await pool.execute(
        `UPDATE school_portal_announcements
         SET title = ?, message = ?, display_type = 'announcement', audience = 'everyone',
             starts_at = ?, ends_at = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [titleOut, message, startsAtAnn, endsAtAnn, existing[0].id]
      );
      return Number(existing[0].id);
    }
    if (!userId) return null;
    const [ins] = await pool.execute(
      `INSERT INTO school_portal_announcements
        (organization_id, created_by_user_id, title, message, display_type, audience, starts_at, ends_at, company_event_id)
       VALUES (?, ?, ?, ?, 'announcement', 'everyone', ?, ?, ?)`,
      [orgId, userId, titleOut, message, startsAtAnn, endsAtAnn, eventId]
    );
    return Number(ins?.insertId || 0) || null;
  } catch (e) {
    // Column may be missing before migration 955; don't fail event save
    if (e?.code === 'ER_BAD_FIELD_ERROR' || String(e?.message || '').includes('company_event_id')) {
      return null;
    }
    throw e;
  }
}

export async function loadSchoolMeta(organizationId) {
  const orgId = Number(organizationId);
  if (!orgId) return { name: null, slug: null };
  const [rows] = await pool.execute(
    `SELECT id, name, portal_url, slug FROM agencies WHERE id = ? LIMIT 1`,
    [orgId]
  );
  const row = rows?.[0];
  if (!row) return { name: null, slug: null };
  return {
    name: row.name ? String(row.name).trim() : null,
    slug: String(row.portal_url || row.slug || '').trim() || null
  };
}

export async function createSchoolPortalEvent({
  agencyId,
  organizationId,
  userId,
  title,
  description,
  category,
  startsAt,
  endsAt,
  timezone,
  outreachTableInvited,
  eventImageUrl,
  flierFileUrl,
  schoolEventStatus
}) {
  const eventType = categoryToEventType(category);
  if (!eventType) throw Object.assign(new Error('Invalid event category'), { status: 400 });

  const start = startsAt instanceof Date ? startsAt : new Date(startsAt);
  const end = endsAt instanceof Date ? endsAt : new Date(endsAt);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
    throw Object.assign(new Error('Invalid start or end date'), { status: 400 });
  }
  if (end <= start) throw Object.assign(new Error('End time must be after start time'), { status: 400 });

  const year = currentCalendarYear(start);
  if (YEARLY_UNIQUE_SCHOOL_EVENT_CATEGORIES.has(String(category || '').trim().toLowerCase())) {
    const existing = await findExistingSchoolEventForYear({ organizationId, eventType, year });
    if (existing) {
      throw Object.assign(
        new Error('This school already has an active event of this type for this year'),
        { status: 409 }
      );
    }
  }

  let tz = String(timezone || '').trim();
  if (!tz) {
    try {
      tz = await ProviderAvailabilityService.resolveAgencyTimeZone({ agencyId });
    } catch {
      tz = 'America/Denver';
    }
  }

  const status = normalizeSchoolEventStatus(schoolEventStatus, { fallback: 'scheduled' });
  // School portal events are staffable by default so providers can apply from hub / schedule.
  const staffingConfig = buildSchoolEventStaffingConfig();

  let insertResult;
  try {
    [insertResult] = await pool.execute(
      `INSERT INTO company_events
        (agency_id, organization_id, created_by_user_id, updated_by_user_id,
         title, description, event_type, starts_at, ends_at, timezone,
         recurrence_json, is_active, rsvp_mode, outreach_table_invited,
         event_image_url, flier_file_url, staffing_config_json, school_event_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'none', ?, ?, ?, ?, ?)`,
      [
        agencyId,
        organizationId,
        userId,
        userId,
        String(title || '').trim(),
        String(description || '').trim() || null,
        eventType,
        start,
        end,
        tz,
        JSON.stringify({ frequency: 'none' }),
        outreachTableInvited ? 1 : 0,
        eventImageUrl || null,
        flierFileUrl || null,
        JSON.stringify(staffingConfig),
        status
      ]
    );
  } catch (e) {
    if (e?.code !== 'ER_BAD_FIELD_ERROR') throw e;
    [insertResult] = await pool.execute(
      `INSERT INTO company_events
        (agency_id, organization_id, created_by_user_id, updated_by_user_id,
         title, description, event_type, starts_at, ends_at, timezone,
         recurrence_json, is_active, rsvp_mode, outreach_table_invited,
         event_image_url, flier_file_url, staffing_config_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'none', ?, ?, ?, ?)`,
      [
        agencyId,
        organizationId,
        userId,
        userId,
        String(title || '').trim(),
        String(description || '').trim() || null,
        eventType,
        start,
        end,
        tz,
        JSON.stringify({ frequency: 'none' }),
        outreachTableInvited ? 1 : 0,
        eventImageUrl || null,
        flierFileUrl || null,
        JSON.stringify(staffingConfig)
      ]
    );
  }

  const eventId = Number(insertResult.insertId);
  await materializeSessionsForEvent(pool, { companyEventId: eventId });
  await syncSchoolEventAnnouncement({
    organizationId,
    companyEventId: eventId,
    userId,
    title,
    category,
    startsAt: start,
    timezone: tz,
    schoolEventStatus: status
  }).catch(() => null);

  const [rows] = await pool.execute('SELECT * FROM company_events WHERE id = ? LIMIT 1', [eventId]);
  const schoolMeta = await loadSchoolMeta(organizationId);
  return mapSchoolEventRow(rows?.[0], schoolMeta);
}

export async function updateSchoolPortalEvent({
  eventId,
  organizationId,
  agencyId,
  userId,
  title,
  description,
  category,
  startsAt,
  endsAt,
  timezone,
  outreachTableInvited,
  eventImageUrl,
  flierFileUrl,
  clearFlier,
  schoolEventStatus
}) {
  const [existingRows] = await pool.execute(
    `SELECT * FROM company_events WHERE id = ? AND agency_id = ? AND organization_id = ? LIMIT 1`,
    [eventId, agencyId, organizationId]
  );
  const existing = existingRows?.[0];
  if (!existing) throw Object.assign(new Error('School event not found'), { status: 404 });
  if (!isSchoolPortalEventType(existing.event_type)) {
    throw Object.assign(new Error('Not a school portal event'), { status: 400 });
  }

  const eventType = category ? categoryToEventType(category) : String(existing.event_type);
  if (!eventType) throw Object.assign(new Error('Invalid event category'), { status: 400 });

  const start = startsAt ? (startsAt instanceof Date ? startsAt : new Date(startsAt)) : new Date(existing.starts_at);
  const end = endsAt ? (endsAt instanceof Date ? endsAt : new Date(endsAt)) : new Date(existing.ends_at);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
    throw Object.assign(new Error('Invalid start or end date'), { status: 400 });
  }
  if (end <= start) throw Object.assign(new Error('End time must be after start time'), { status: 400 });

  const year = currentCalendarYear(start);
  const categoryForUniqueness = eventTypeToCategory(eventType);
  if (YEARLY_UNIQUE_SCHOOL_EVENT_CATEGORIES.has(String(categoryForUniqueness || '').toLowerCase())) {
    const dup = await findExistingSchoolEventForYear({
      organizationId,
      eventType,
      year,
      excludeEventId: eventId
    });
    if (dup) {
      throw Object.assign(
        new Error('This school already has an active event of this type for this year'),
        { status: 409 }
      );
    }
  }

  const outreach =
    outreachTableInvited !== undefined
      ? !!outreachTableInvited
      : !!(existing.outreach_table_invited === 1 || existing.outreach_table_invited === true);

  // Keep school events staffable; outreach flag is independent of provider signup.
  let staffingConfig = existing.staffing_config_json;
  if (!staffingConfig || outreach) {
    staffingConfig = JSON.stringify(buildSchoolEventStaffingConfig());
  }

  const nextImage =
    eventImageUrl !== undefined ? (eventImageUrl || null) : existing.event_image_url;
  let nextFlier = existing.flier_file_url;
  if (clearFlier) nextFlier = null;
  else if (flierFileUrl !== undefined) nextFlier = flierFileUrl || null;

  const prevStatus = normalizeSchoolEventStatus(existing.school_event_status, { fallback: 'scheduled' });
  let status = schoolEventStatus !== undefined
    ? normalizeSchoolEventStatus(schoolEventStatus, { fallback: prevStatus })
    : prevStatus;
  // Changing the date/time without an explicit status marks the event rescheduled
  if (
    schoolEventStatus === undefined &&
    status !== 'canceled' &&
    startsAt &&
    existing.starts_at &&
    new Date(existing.starts_at).getTime() !== start.getTime()
  ) {
    status = 'rescheduled';
  }

  const tz = String(timezone || existing.timezone || 'America/Denver').trim();

  try {
    await pool.execute(
      `UPDATE company_events
       SET updated_by_user_id = ?, title = ?, description = ?, event_type = ?,
           starts_at = ?, ends_at = ?, timezone = ?, outreach_table_invited = ?,
           event_image_url = ?, flier_file_url = ?, staffing_config_json = ?,
           school_event_status = ?, is_active = 1
       WHERE id = ? AND agency_id = ? AND organization_id = ?`,
      [
        userId,
        String(title ?? existing.title).trim(),
        String(description ?? existing.description ?? '').trim() || null,
        eventType,
        start,
        end,
        tz,
        outreach ? 1 : 0,
        nextImage,
        nextFlier,
        staffingConfig,
        status,
        eventId,
        agencyId,
        organizationId
      ]
    );
  } catch (e) {
    if (e?.code !== 'ER_BAD_FIELD_ERROR') throw e;
    await pool.execute(
      `UPDATE company_events
       SET updated_by_user_id = ?, title = ?, description = ?, event_type = ?,
           starts_at = ?, ends_at = ?, timezone = ?, outreach_table_invited = ?,
           event_image_url = ?, flier_file_url = ?, staffing_config_json = ?,
           is_active = 1
       WHERE id = ? AND agency_id = ? AND organization_id = ?`,
      [
        userId,
        String(title ?? existing.title).trim(),
        String(description ?? existing.description ?? '').trim() || null,
        eventType,
        start,
        end,
        tz,
        outreach ? 1 : 0,
        nextImage,
        nextFlier,
        staffingConfig,
        eventId,
        agencyId,
        organizationId
      ]
    );
  }

  if (status !== 'canceled') {
    await materializeSessionsForEvent(pool, { companyEventId: eventId });
  }

  await syncSchoolEventAnnouncement({
    organizationId,
    companyEventId: eventId,
    userId,
    title: title ?? existing.title,
    category: categoryForUniqueness,
    startsAt: start,
    timezone: tz,
    schoolEventStatus: status
  }).catch(() => null);

  const [rows] = await pool.execute('SELECT * FROM company_events WHERE id = ? LIMIT 1', [eventId]);
  const schoolMeta = await loadSchoolMeta(organizationId);
  return mapSchoolEventRow(rows?.[0], schoolMeta);
}

export async function listSchoolEventsForOrg(organizationId) {
  const orgId = Number(organizationId);
  const placeholders = [...SCHOOL_PORTAL_EVENT_TYPES].map(() => '?').join(', ');
  const [rows] = await pool.execute(
    `SELECT * FROM company_events
     WHERE organization_id = ?
       AND event_type IN (${placeholders})
       AND is_active = 1
     ORDER BY starts_at DESC`,
    [orgId, ...SCHOOL_PORTAL_EVENT_TYPES]
  );
  const schoolMeta = await loadSchoolMeta(orgId);
  return (rows || []).map((row) => mapSchoolEventRow(row, schoolMeta));
}

export async function getMissingCategoriesForOrg(organizationId, year = currentCalendarYear()) {
  const events = await listSchoolEventsForOrg(organizationId);
  const posted = new Set(
    events
      .filter((e) => {
        const d = e.startsAt ? new Date(e.startsAt) : null;
        return d && Number.isFinite(d.getTime()) && d.getFullYear() === year;
      })
      .map((e) => e.category)
      .filter(Boolean)
  );
  // Prompt / request-submissions only track yearly-required categories.
  return [...YEARLY_UNIQUE_SCHOOL_EVENT_CATEGORIES].filter((c) => !posted.has(c));
}

export async function listAffiliatedSchoolsForAgency(agencyId) {
  const aid = Number(agencyId);
  if (!aid) return [];
  const [rows] = await pool.execute(
    `SELECT a.id, a.name, a.portal_url, a.slug, a.organization_type
     FROM organization_affiliations oa
     JOIN agencies a ON a.id = oa.organization_id
     WHERE oa.agency_id = ?
       AND oa.is_active = 1
       AND LOWER(COALESCE(a.organization_type, '')) IN ('school', 'program', 'learning')
     ORDER BY a.name ASC`,
    [aid]
  ).catch(async () => {
    const [legacy] = await pool.execute(
      `SELECT a.id, a.name, a.portal_url, a.slug, a.organization_type
       FROM agency_schools asch
       JOIN agencies a ON a.id = asch.school_organization_id
       WHERE asch.agency_id = ?
       ORDER BY a.name ASC`,
      [aid]
    );
    return legacy;
  });
  return (rows || []).map((row) => ({
    id: Number(row.id),
    name: row.name ? String(row.name).trim() : '',
    slug: String(row.portal_url || row.slug || '').trim() || null,
    organizationType: row.organization_type || null
  }));
}

export async function getSchoolEventOverviewForAgency(agencyId, year = currentCalendarYear()) {
  const schools = await listAffiliatedSchoolsForAgency(agencyId);
  const schoolIds = schools.map((s) => s.id);
  if (!schoolIds.length) {
    return { year, schools: [], events: [], missingBySchool: {} };
  }

  const placeholders = schoolIds.map(() => '?').join(', ');
  const typePlaceholders = [...SCHOOL_PORTAL_EVENT_TYPES].map(() => '?').join(', ');
  const [eventRows] = await pool.execute(
    `SELECT ce.*, a.name AS school_name, a.portal_url AS school_portal_url, a.slug AS school_slug
     FROM company_events ce
     JOIN agencies a ON a.id = ce.organization_id
     WHERE ce.agency_id = ?
       AND ce.organization_id IN (${placeholders})
       AND ce.event_type IN (${typePlaceholders})
       AND ce.is_active = 1
       AND YEAR(ce.starts_at) = ?
     ORDER BY ce.starts_at ASC`,
    [agencyId, ...schoolIds, ...SCHOOL_PORTAL_EVENT_TYPES, year]
  );

  const events = (eventRows || []).map((row) =>
    mapSchoolEventRow(row, { name: row.school_name, slug: row.school_portal_url || row.school_slug })
  );

  const missingBySchool = {};
  for (const school of schools) {
    missingBySchool[school.id] = await getMissingCategoriesForOrg(school.id, year);
  }

  return { year, schools, events, missingBySchool };
}

export function makePostToken() {
  return crypto.randomBytes(24).toString('hex');
}

export async function createPostToken({
  agencyId,
  schoolOrganizationId,
  eventCategory,
  createdByUserId,
  expiresAt
}) {
  const token = makePostToken();
  await pool.execute(
    `INSERT INTO school_event_post_tokens
      (token, agency_id, school_organization_id, event_category, created_by_user_id, expires_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [token, agencyId, schoolOrganizationId, eventCategory, createdByUserId || null, expiresAt]
  );
  return token;
}

export async function validatePostToken(token) {
  const t = String(token || '').trim();
  if (!t) return null;
  const [rows] = await pool.execute(
    `SELECT t.*, a.portal_url, a.slug, a.name AS school_name
     FROM school_event_post_tokens t
     JOIN agencies a ON a.id = t.school_organization_id
     WHERE t.token = ?
     LIMIT 1`,
    [t]
  );
  const row = rows?.[0];
  if (!row) return null;
  if (row.used_at) return { valid: false, reason: 'used' };
  const exp = row.expires_at ? new Date(row.expires_at) : null;
  if (!exp || exp.getTime() < Date.now()) return { valid: false, reason: 'expired' };
  return {
    valid: true,
    token: t,
    agencyId: Number(row.agency_id),
    schoolOrganizationId: Number(row.school_organization_id),
    eventCategory: String(row.event_category),
    schoolName: row.school_name ? String(row.school_name).trim() : null,
    schoolSlug: String(row.portal_url || row.slug || '').trim() || null
  };
}

export async function markPostTokenUsed(token, companyEventId) {
  await pool.execute(
    `UPDATE school_event_post_tokens
     SET used_at = NOW(), company_event_id = ?
     WHERE token = ? AND used_at IS NULL`,
    [Number(companyEventId), String(token)]
  );
}
