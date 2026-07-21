import crypto from 'crypto';
import pool from '../config/database.js';
import OrganizationAffiliation from '../models/OrganizationAffiliation.model.js';
import AgencySchool from '../models/AgencySchool.model.js';
import ProviderAvailabilityService from './providerAvailability.service.js';
import { materializeSessionsForEvent } from './companyEventSessionDates.service.js';

export const SCHOOL_PORTAL_EVENT_TYPES = new Set([
  'school_back_to_school',
  'school_fall_check_in',
  'school_spring_event',
  'school_first_day',
  'school_open_house',
  'school_resource_fair',
  'school_family_night',
  'school_orientation',
  'school_holiday',
  'school_day_off',
  'school_other'
]);

/**
 * Categories that enforce one active attendable event per school per school year (Aug 1 – Jul 31).
 * First Day of School is an important date (calendar-only) and is intentionally not unique —
 * schools may have Jump Start and a later first day.
 */
export const YEARLY_UNIQUE_SCHOOL_EVENT_CATEGORIES = new Set([
  'back_to_school',
  'fall_check_in',
  'spring'
]);

export const SCHOOL_EVENT_CATEGORIES = [
  'back_to_school',
  'fall_check_in',
  'spring',
  'first_day',
  'open_house',
  'resource_fair',
  'family_night',
  'orientation',
  'holiday',
  'day_off',
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
  if (c === 'fall_check_in') return 'school_fall_check_in';
  if (c === 'spring') return 'school_spring_event';
  if (c === 'first_day') return 'school_first_day';
  if (c === 'open_house') return 'school_open_house';
  if (c === 'resource_fair') return 'school_resource_fair';
  if (c === 'family_night') return 'school_family_night';
  if (c === 'orientation') return 'school_orientation';
  if (c === 'holiday') return 'school_holiday';
  if (c === 'day_off') return 'school_day_off';
  if (c === 'other') return 'school_other';
  return null;
}

export function eventTypeToCategory(eventType) {
  const t = String(eventType || '').trim().toLowerCase();
  if (t === 'school_back_to_school') return 'back_to_school';
  if (t === 'school_fall_check_in') return 'fall_check_in';
  if (t === 'school_spring_event') return 'spring';
  if (t === 'school_first_day') return 'first_day';
  if (t === 'school_open_house') return 'open_house';
  if (t === 'school_resource_fair') return 'resource_fair';
  if (t === 'school_family_night') return 'family_night';
  if (t === 'school_orientation') return 'orientation';
  if (t === 'school_holiday') return 'holiday';
  if (t === 'school_day_off') return 'day_off';
  if (t === 'school_other') return 'other';
  return null;
}

/** Display label for a school event category. */
export function schoolEventCategoryLabel(category) {
  const map = {
    back_to_school: 'Back to School',
    fall_check_in: 'Fall School Check-in',
    spring: 'Spring School Check-in',
    first_day: 'First Day of School',
    open_house: 'Open House',
    resource_fair: 'Resource Fair',
    family_night: 'Family Night',
    orientation: 'Orientation',
    holiday: 'Holiday',
    day_off: 'Day Off',
    other: 'School Event'
  };
  return map[String(category || '').trim().toLowerCase()] || 'School Event';
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

/**
 * School year runs Aug 1 – Jul 31.
 * @param {Date|string|number} [input] - Date, ISO string, or label "2026-2027"
 * @returns {{ startYear: number, endYear: number, label: string, start: string, end: string, startDate: Date, endDate: Date }}
 */
export function schoolYearBounds(input = new Date()) {
  let startYear;
  if (typeof input === 'string' && /^\d{4}-\d{4}$/.test(String(input).trim())) {
    startYear = parseInt(String(input).trim().split('-')[0], 10);
  } else {
    const d = input instanceof Date ? input : new Date(input);
    const y = Number.isFinite(d.getTime()) ? d.getFullYear() : new Date().getFullYear();
    const m = Number.isFinite(d.getTime()) ? d.getMonth() + 1 : new Date().getMonth() + 1;
    startYear = m >= 8 ? y : y - 1;
  }
  if (!Number.isFinite(startYear)) startYear = new Date().getFullYear();
  const endYear = startYear + 1;
  return {
    startYear,
    endYear,
    label: `${startYear}-${endYear}`,
    start: `${startYear}-08-01`,
    end: `${endYear}-07-31`,
    startDate: new Date(Date.UTC(startYear, 7, 1, 0, 0, 0, 0)),
    endDate: new Date(Date.UTC(endYear, 6, 31, 23, 59, 59, 999))
  };
}

/** @deprecated Prefer schoolYearBounds; kept for callers that still pass calendar year. */
export function currentSchoolYearLabel(date = new Date()) {
  return schoolYearBounds(date).label;
}

export async function findExistingSchoolEventForYear({
  organizationId,
  eventType,
  year,
  schoolYear,
  excludeEventId = null
}) {
  const orgId = Number(organizationId);
  const et = String(eventType || '').trim();
  if (!orgId || !et) return null;
  const bounds = schoolYear
    ? schoolYearBounds(schoolYear)
    : Number.isFinite(Number(year))
      ? schoolYearBounds(`${Number(year)}-${Number(year) + 1}`)
      : schoolYearBounds(new Date());
  const params = [orgId, et, bounds.startDate, bounds.endDate];
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
       AND starts_at >= ?
       AND starts_at <= ?
       ${excludeSql}
     LIMIT 1`,
    params
  );
  return rows?.[0] || null;
}

export function buildSchoolEventStaffingConfig({ minProvidersPerSession = 2, enabled = true } = {}) {
  return {
    enabled: enabled !== false,
    minProvidersPerSession: Math.max(1, Number(minProvidersPerSession) || 2),
    clientRule: { enabled: false, confirmedStepSize: 1, additionalProvidersPerStep: 0, threshold: null },
    groupRule: { enabled: false, baseProvidersForOneGroup: 0, additionalProvidersPerGroup: 0 },
    onCall: { enabled: false, leadHours: 0 },
    waitlist: { enabled: false },
    providerSignup: { enabled: enabled !== false }
  };
}

/**
 * Calendar-only school dates (not attendable; no provider staffing).
 * Back to School and other parent/family events remain staffable.
 */
export const CALENDAR_ONLY_SCHOOL_EVENT_CATEGORIES = new Set([
  'holiday',
  'day_off',
  'first_day',
  'fall_check_in',
  'spring'
]);

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
  minProvidersPerSession = 2
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
  const cat = eventTypeToCategory(row.event_type);
  if (CALENDAR_ONLY_SCHOOL_EVENT_CATEGORIES.has(String(cat || ''))) {
    throw Object.assign(
      new Error(
        'Calendar-only dates (first day, fall/spring check-in, holidays, days off) cannot open provider staffing'
      ),
      { status: 400 }
    );
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

/** Wall-clock HH:MM[:SS] → MySQL TIME string, or null. */
export function parseSchoolEventWallTime(raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  const s = String(raw).trim();
  if (!s) return null;
  const m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  const hh = String(Math.min(23, Math.max(0, parseInt(m[1], 10)))).padStart(2, '0');
  const mm = String(Math.min(59, Math.max(0, parseInt(m[2], 10)))).padStart(2, '0');
  const ss = m[3] ? String(Math.min(59, Math.max(0, parseInt(m[3], 10)))).padStart(2, '0') : '00';
  return `${hh}:${mm}:${ss}`;
}

export function mapSchoolEventRow(row, schoolMeta = {}) {
  if (!row) return null;
  const eventType = String(row.event_type || '').trim();
  const reportRaw = row.employee_report_time;
  const directRaw = row.skill_builder_direct_hours;
  let minProvidersPerSession = 2;
  let staffingEnabled = false;
  try {
    const cfg =
      typeof row.staffing_config_json === 'string'
        ? JSON.parse(row.staffing_config_json)
        : row.staffing_config_json || null;
    if (cfg && typeof cfg === 'object') {
      staffingEnabled = cfg.enabled !== false && !!row.staffing_config_json;
      const n = Number(cfg.minProvidersPerSession);
      if (Number.isFinite(n) && n >= 1) minProvidersPerSession = Math.min(99, Math.floor(n));
    }
  } catch {
    /* ignore */
  }
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
    employeeReportTime: reportRaw != null && reportRaw !== ''
      ? String(reportRaw).slice(0, 8)
      : null,
    skillBuilderDirectHours:
      directRaw != null && directRaw !== '' && Number.isFinite(Number(directRaw))
        ? Number(directRaw)
        : 0,
    minProvidersPerSession,
    staffingEnabled,
    isActive: !!(row.is_active === 1 || row.is_active === true),
    outreachTableInvited: !!(row.outreach_table_invited === 1 || row.outreach_table_invited === true),
    eventImageUrl: row.event_image_url ? String(row.event_image_url).trim() : '',
    flierFileUrl: row.flier_file_url ? String(row.flier_file_url).trim() : '',
    detailsUrl: row.details_url ? String(row.details_url).trim() : '',
    schoolEventStatus: normalizeSchoolEventStatus(row.school_event_status, {
      fallback: row.is_active ? 'scheduled' : 'canceled'
    }),
    districtBroadcastId: row.district_broadcast_id || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    schoolName: schoolMeta.name || null,
    schoolSlug: schoolMeta.slug || null,
    districtName: schoolMeta.districtName || null
  };
}

function categoryLabel(category) {
  return schoolEventCategoryLabel(category);
}

function normalizeDetailsUrl(raw) {
  if (raw === undefined) return undefined;
  if (raw === null || raw === '') return null;
  const s = String(raw).trim();
  if (!s) return null;
  if (s.length > 1000) return s.slice(0, 1000);
  return s;
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
  const calendarOnly = CALENDAR_ONLY_SCHOOL_EVENT_CATEGORIES.has(
    String(category || '').trim().toLowerCase()
  );
  if (status === 'canceled') {
    titleOut = calendarOnly ? 'Date canceled' : 'Event canceled';
    message = `${title || typeLabel} has been canceled${when ? ` (was ${when})` : ''}.`;
  } else if (status === 'rescheduled') {
    titleOut = calendarOnly ? 'Date updated' : 'Event rescheduled';
    message = `${title || typeLabel} has been moved to ${when || 'a new date/time'}.`;
  } else if (calendarOnly) {
    titleOut = typeLabel;
    message = `${title || typeLabel} — ${when || 'upcoming'}.`;
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
  detailsUrl = null,
  schoolEventStatus,
  employeeReportTime = null,
  skillBuilderDirectHours = 0,
  minProvidersPerSession = 2,
  districtBroadcastId = null
}) {
  const eventType = categoryToEventType(category);
  if (!eventType) throw Object.assign(new Error('Invalid event category'), { status: 400 });

  const start = startsAt instanceof Date ? startsAt : new Date(startsAt);
  const end = endsAt instanceof Date ? endsAt : new Date(endsAt);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
    throw Object.assign(new Error('Invalid start or end date'), { status: 400 });
  }
  if (end <= start) throw Object.assign(new Error('End time must be after start time'), { status: 400 });

  const sy = schoolYearBounds(start);
  if (YEARLY_UNIQUE_SCHOOL_EVENT_CATEGORIES.has(String(category || '').trim().toLowerCase())) {
    const existing = await findExistingSchoolEventForYear({
      organizationId,
      eventType,
      schoolYear: sy.label
    });
    if (existing) {
      const existingTitle = String(existing.title || '').trim();
      const label = schoolEventCategoryLabel(category);
      throw Object.assign(
        new Error(
          existingTitle
            ? `This school already has a ${label} for the ${sy.label} school year (“${existingTitle}”). Edit that entry or choose a different type.`
            : `This school already has a ${label} for the ${sy.label} school year.`
        ),
        { status: 409 }
      );
    }
  }

  const nextDetailsUrl = normalizeDetailsUrl(detailsUrl) ?? null;

  let tz = String(timezone || '').trim();
  if (!tz) {
    try {
      tz = await ProviderAvailabilityService.resolveAgencyTimeZone({ agencyId });
    } catch {
      tz = 'America/Denver';
    }
  }

  const status = normalizeSchoolEventStatus(schoolEventStatus, { fallback: 'scheduled' });
  const catNorm = String(category || '').trim().toLowerCase();
  const staffingEnabled = !CALENDAR_ONLY_SCHOOL_EVENT_CATEGORIES.has(catNorm);
  const staffingConfig = buildSchoolEventStaffingConfig({
    minProvidersPerSession,
    enabled: staffingEnabled
  });
  const reportTime = parseSchoolEventWallTime(employeeReportTime);
  // Default all-indirect for school-event kiosk payroll (cap 0 → only indirect claim).
  const directHours =
    skillBuilderDirectHours != null && Number.isFinite(Number(skillBuilderDirectHours))
      ? Math.max(0, Number(skillBuilderDirectHours))
      : 0;

  const broadcastId = districtBroadcastId
    ? String(districtBroadcastId).trim().slice(0, 36) || null
    : null;

  let insertResult;
  try {
    [insertResult] = await pool.execute(
      `INSERT INTO company_events
        (agency_id, organization_id, created_by_user_id, updated_by_user_id,
         title, description, event_type, starts_at, ends_at, timezone,
         recurrence_json, is_active, rsvp_mode, outreach_table_invited,
         event_image_url, flier_file_url, details_url, staffing_config_json, school_event_status,
         employee_report_time, skill_builder_direct_hours, district_broadcast_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'none', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        nextDetailsUrl,
        JSON.stringify(staffingConfig),
        status,
        reportTime,
        directHours,
        broadcastId
      ]
    );
  } catch (e) {
    if (e?.code !== 'ER_BAD_FIELD_ERROR') throw e;
    try {
      [insertResult] = await pool.execute(
        `INSERT INTO company_events
          (agency_id, organization_id, created_by_user_id, updated_by_user_id,
           title, description, event_type, starts_at, ends_at, timezone,
           recurrence_json, is_active, rsvp_mode, outreach_table_invited,
           event_image_url, flier_file_url, staffing_config_json, school_event_status,
           employee_report_time, skill_builder_direct_hours, district_broadcast_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'none', ?, ?, ?, ?, ?, ?, ?, ?)`,
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
          status,
          reportTime,
          directHours,
          broadcastId
        ]
      );
    } catch (e2) {
      if (e2?.code !== 'ER_BAD_FIELD_ERROR') throw e2;
      try {
        [insertResult] = await pool.execute(
          `INSERT INTO company_events
            (agency_id, organization_id, created_by_user_id, updated_by_user_id,
             title, description, event_type, starts_at, ends_at, timezone,
             recurrence_json, is_active, rsvp_mode, outreach_table_invited,
             event_image_url, flier_file_url, staffing_config_json, school_event_status,
             employee_report_time, skill_builder_direct_hours)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'none', ?, ?, ?, ?, ?, ?, ?)`,
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
            status,
            reportTime,
            directHours
          ]
        );
      } catch (e3) {
        if (e3?.code !== 'ER_BAD_FIELD_ERROR') throw e3;
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
    }
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
  detailsUrl,
  schoolEventStatus,
  employeeReportTime,
  skillBuilderDirectHours,
  minProvidersPerSession
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

  const sy = schoolYearBounds(start);
  const categoryForUniqueness = eventTypeToCategory(eventType);
  if (YEARLY_UNIQUE_SCHOOL_EVENT_CATEGORIES.has(String(categoryForUniqueness || '').toLowerCase())) {
    const dup = await findExistingSchoolEventForYear({
      organizationId,
      eventType,
      schoolYear: sy.label,
      excludeEventId: eventId
    });
    if (dup) {
      const existingTitle = String(dup.title || '').trim();
      const label = schoolEventCategoryLabel(categoryForUniqueness);
      throw Object.assign(
        new Error(
          existingTitle
            ? `This school already has a ${label} for the ${sy.label} school year (“${existingTitle}”). Edit that entry or choose a different type.`
            : `This school already has a ${label} for the ${sy.label} school year.`
        ),
        { status: 409 }
      );
    }
  }

  const outreach =
    outreachTableInvited !== undefined
      ? !!outreachTableInvited
      : !!(existing.outreach_table_invited === 1 || existing.outreach_table_invited === true);

  let existingCfg = {};
  try {
    existingCfg =
      typeof existing.staffing_config_json === 'string'
        ? JSON.parse(existing.staffing_config_json || '{}')
        : existing.staffing_config_json || {};
  } catch {
    existingCfg = {};
  }
  const prevMin = Number(existingCfg?.minProvidersPerSession) || 2;
  const nextMin =
    minProvidersPerSession !== undefined && minProvidersPerSession !== null
      ? Math.max(1, Math.min(99, Number(minProvidersPerSession) || 2))
      : prevMin;
  const calendarOnly = CALENDAR_ONLY_SCHOOL_EVENT_CATEGORIES.has(
    String(categoryForUniqueness || '').toLowerCase()
  );
  const staffingWasEnabled = existingCfg?.enabled !== false && !!existing.staffing_config_json;
  const staffingConfig = JSON.stringify(
    buildSchoolEventStaffingConfig({
      minProvidersPerSession: nextMin,
      enabled: calendarOnly ? false : staffingWasEnabled || true
    })
  );

  const nextImage =
    eventImageUrl !== undefined ? (eventImageUrl || null) : existing.event_image_url;
  let nextFlier = existing.flier_file_url;
  if (clearFlier) nextFlier = null;
  else if (flierFileUrl !== undefined) nextFlier = flierFileUrl || null;
  let nextDetailsUrl = existing.details_url ?? null;
  if (detailsUrl !== undefined) {
    nextDetailsUrl = normalizeDetailsUrl(detailsUrl);
  }

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

  let nextReportTime = existing.employee_report_time ?? null;
  if (employeeReportTime !== undefined) {
    nextReportTime = employeeReportTime === null || employeeReportTime === ''
      ? null
      : parseSchoolEventWallTime(employeeReportTime);
  }

  let nextDirectHours =
    existing.skill_builder_direct_hours != null && existing.skill_builder_direct_hours !== ''
      ? Number(existing.skill_builder_direct_hours)
      : 0;
  if (skillBuilderDirectHours !== undefined && skillBuilderDirectHours !== null) {
    const n = Number(skillBuilderDirectHours);
    if (Number.isFinite(n) && n >= 0) nextDirectHours = n;
  }

  try {
    await pool.execute(
      `UPDATE company_events
       SET updated_by_user_id = ?, title = ?, description = ?, event_type = ?,
           starts_at = ?, ends_at = ?, timezone = ?, outreach_table_invited = ?,
           event_image_url = ?, flier_file_url = ?, details_url = ?, staffing_config_json = ?,
           school_event_status = ?, employee_report_time = ?, skill_builder_direct_hours = ?,
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
        nextDetailsUrl,
        staffingConfig,
        status,
        nextReportTime,
        nextDirectHours,
        eventId,
        agencyId,
        organizationId
      ]
    );
  } catch (e) {
    if (e?.code !== 'ER_BAD_FIELD_ERROR') throw e;
    try {
      await pool.execute(
        `UPDATE company_events
         SET updated_by_user_id = ?, title = ?, description = ?, event_type = ?,
             starts_at = ?, ends_at = ?, timezone = ?, outreach_table_invited = ?,
             event_image_url = ?, flier_file_url = ?, staffing_config_json = ?,
             school_event_status = ?, employee_report_time = ?, skill_builder_direct_hours = ?,
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
          status,
          nextReportTime,
          nextDirectHours,
          eventId,
          agencyId,
          organizationId
        ]
      );
    } catch (e2) {
      if (e2?.code !== 'ER_BAD_FIELD_ERROR') throw e2;
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

export async function getMissingCategoriesForOrg(organizationId, yearOrSchoolYear = currentSchoolYearLabel()) {
  const bounds =
    typeof yearOrSchoolYear === 'string' && /^\d{4}-\d{4}$/.test(String(yearOrSchoolYear).trim())
      ? schoolYearBounds(yearOrSchoolYear)
      : Number.isFinite(Number(yearOrSchoolYear))
        ? schoolYearBounds(`${Number(yearOrSchoolYear)}-${Number(yearOrSchoolYear) + 1}`)
        : schoolYearBounds(new Date());
  const events = await listSchoolEventsForOrg(organizationId);
  const startMs = bounds.startDate.getTime();
  const endMs = bounds.endDate.getTime();
  const posted = new Set(
    events
      .filter((e) => {
        const d = e.startsAt ? new Date(e.startsAt) : null;
        if (!d || !Number.isFinite(d.getTime())) return false;
        const t = d.getTime();
        return t >= startMs && t <= endMs;
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

export async function getSchoolEventOverviewForAgency(agencyId, yearOrSchoolYear = currentSchoolYearLabel()) {
  const bounds =
    typeof yearOrSchoolYear === 'string' && /^\d{4}-\d{4}$/.test(String(yearOrSchoolYear).trim())
      ? schoolYearBounds(yearOrSchoolYear)
      : Number.isFinite(Number(yearOrSchoolYear))
        ? schoolYearBounds(`${Number(yearOrSchoolYear)}-${Number(yearOrSchoolYear) + 1}`)
        : schoolYearBounds(new Date());
  const schools = await listAffiliatedSchoolsForAgency(agencyId);
  const schoolIds = schools.map((s) => s.id);
  if (!schoolIds.length) {
    return {
      year: bounds.startYear,
      schoolYear: bounds.label,
      range: { start: bounds.start, end: bounds.end },
      schools: [],
      events: [],
      missingBySchool: {}
    };
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
       AND ce.starts_at >= ?
       AND ce.starts_at <= ?
     ORDER BY ce.starts_at ASC`,
    [agencyId, ...schoolIds, ...SCHOOL_PORTAL_EVENT_TYPES, bounds.startDate, bounds.endDate]
  );

  const events = (eventRows || []).map((row) =>
    mapSchoolEventRow(row, { name: row.school_name, slug: row.school_portal_url || row.school_slug })
  );

  const missingBySchool = {};
  for (const school of schools) {
    missingBySchool[school.id] = await getMissingCategoriesForOrg(school.id, bounds.label);
  }

  return {
    year: bounds.startYear,
    schoolYear: bounds.label,
    range: { start: bounds.start, end: bounds.end },
    schools,
    events,
    missingBySchool
  };
}

/**
 * School-year coverage matrix for Back to School / Fall / Spring check-ins,
 * including assigned providers and pending assignment requests.
 */
export async function getSchoolYearCoverageForAgency(agencyId, schoolYear = currentSchoolYearLabel()) {
  const bounds = schoolYearBounds(schoolYear || currentSchoolYearLabel());
  const schools = await listAffiliatedSchoolsForAgency(agencyId);
  const schoolIds = schools.map((s) => s.id);
  const trackedCats = ['back_to_school', 'fall_check_in', 'spring'];
  const trackedTypes = trackedCats.map((c) => categoryToEventType(c)).filter(Boolean);

  const emptyTotals = () => {
    const totals = { schools: schoolIds.length };
    for (const c of trackedCats) totals[c] = { have: 0, total: schoolIds.length };
    return totals;
  };

  if (!schoolIds.length) {
    return {
      schoolYear: bounds.label,
      range: { start: bounds.start, end: bounds.end },
      totals: emptyTotals(),
      schools: []
    };
  }

  // District names from school_profiles when available
  const placeholders = schoolIds.map(() => '?').join(', ');
  let districtBySchool = {};
  try {
    const [distRows] = await pool.execute(
      `SELECT school_organization_id AS id, TRIM(district_name) AS district_name
       FROM school_profiles
       WHERE school_organization_id IN (${placeholders})`,
      schoolIds
    );
    for (const r of distRows || []) {
      if (r?.id != null && r.district_name) {
        districtBySchool[Number(r.id)] = String(r.district_name).trim();
      }
    }
  } catch {
    districtBySchool = {};
  }

  const typePlaceholders = trackedTypes.map(() => '?').join(', ');
  const [eventRows] = await pool.execute(
    `SELECT ce.id, ce.organization_id, ce.event_type, ce.title, ce.description, ce.details_url,
            ce.starts_at, ce.ends_at, ce.timezone, ce.school_event_status
     FROM company_events ce
     WHERE ce.agency_id = ?
       AND ce.organization_id IN (${placeholders})
       AND ce.event_type IN (${typePlaceholders})
       AND ce.is_active = 1
       AND COALESCE(ce.school_event_status, 'scheduled') <> 'canceled'
       AND ce.starts_at >= ?
       AND ce.starts_at <= ?
     ORDER BY ce.starts_at ASC`,
    [agencyId, ...schoolIds, ...trackedTypes, bounds.startDate, bounds.endDate]
  );

  const eventIds = (eventRows || []).map((r) => Number(r.id)).filter(Boolean);
  const assignedByEvent = {};
  const pendingByEvent = {};

  if (eventIds.length) {
    const eidPh = eventIds.map(() => '?').join(', ');
    try {
      const [assignedRows] = await pool.execute(
        `SELECT cesd.company_event_id AS event_id, u.id AS user_id,
                TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))) AS name
         FROM company_event_session_dates cesd
         JOIN company_event_session_providers cesp ON cesp.session_date_id = cesd.id
         JOIN users u ON u.id = cesp.provider_user_id
         WHERE cesd.company_event_id IN (${eidPh})
           AND LOWER(COALESCE(cesp.assignment_status, 'finalized')) IN ('finalized', 'tentative')`,
        eventIds
      );
      for (const r of assignedRows || []) {
        const eid = Number(r.event_id);
        if (!assignedByEvent[eid]) assignedByEvent[eid] = [];
        const name = String(r.name || '').trim() || `User ${r.user_id}`;
        if (!assignedByEvent[eid].some((p) => p.userId === Number(r.user_id))) {
          assignedByEvent[eid].push({ userId: Number(r.user_id), name });
        }
      }
    } catch {
      /* tables may vary */
    }
    try {
      const [pendingRows] = await pool.execute(
        `SELECT cesd.company_event_id AS event_id, u.id AS user_id,
                TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))) AS name,
                r.status
         FROM company_event_session_dates cesd
         JOIN company_event_session_provider_requests r ON r.session_date_id = cesd.id
         JOIN users u ON u.id = r.provider_user_id
         WHERE cesd.company_event_id IN (${eidPh})
           AND LOWER(COALESCE(r.status, '')) = 'pending'`,
        eventIds
      );
      for (const r of pendingRows || []) {
        const eid = Number(r.event_id);
        if (!pendingByEvent[eid]) pendingByEvent[eid] = [];
        const name = String(r.name || '').trim() || `User ${r.user_id}`;
        if (!pendingByEvent[eid].some((p) => p.userId === Number(r.user_id))) {
          pendingByEvent[eid].push({ userId: Number(r.user_id), name, status: 'pending' });
        }
      }
    } catch {
      /* tables may vary */
    }
  }

  // First event per school+category wins (ordered by starts_at)
  const bySchoolCat = {};
  for (const row of eventRows || []) {
    const sid = Number(row.organization_id);
    const cat = eventTypeToCategory(row.event_type);
    if (!trackedCats.includes(cat)) continue;
    const key = `${sid}:${cat}`;
    if (bySchoolCat[key]) continue;
    const eid = Number(row.id);
    bySchoolCat[key] = {
      eventId: eid,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      timezone: row.timezone || null,
      title: row.title || '',
      detailsUrl: row.details_url ? String(row.details_url).trim() : '',
      locationOrDescription: row.description ? String(row.description).trim() : '',
      assigned: assignedByEvent[eid] || [],
      pendingRequests: pendingByEvent[eid] || []
    };
  }

  const totals = emptyTotals();
  const schoolOut = schools.map((s) => {
    const events = {};
    for (const c of trackedCats) {
      const ev = bySchoolCat[`${s.id}:${c}`] || null;
      events[c] = ev;
      if (ev) totals[c].have += 1;
    }
    return {
      id: s.id,
      name: s.name,
      districtName: districtBySchool[s.id] || null,
      events
    };
  });

  return {
    schoolYear: bounds.label,
    range: { start: bounds.start, end: bounds.end },
    totals,
    schools: schoolOut
  };
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

/** Distinct district names for schools linked to an agency (affiliation + agency_schools). */
export async function listDistrictsForAgency(agencyId) {
  const aid = Number(agencyId);
  if (!aid) return [];
  const [rows] = await pool.execute(
    `SELECT DISTINCT TRIM(sp.district_name) AS district_name, COUNT(*) AS school_count
     FROM school_profiles sp
     INNER JOIN agencies org ON org.id = sp.school_organization_id
     WHERE TRIM(COALESCE(sp.district_name, '')) <> ''
       AND (org.is_archived = FALSE OR org.is_archived IS NULL)
       AND (
         EXISTS (
           SELECT 1 FROM organization_affiliations oa
           WHERE oa.organization_id = sp.school_organization_id
             AND oa.agency_id = ? AND oa.is_active = TRUE
         )
         OR EXISTS (
           SELECT 1 FROM agency_schools asx
           WHERE asx.school_organization_id = sp.school_organization_id
             AND asx.agency_id = ? AND asx.is_active = TRUE
         )
       )
     GROUP BY TRIM(sp.district_name)
     ORDER BY district_name ASC`,
    [aid, aid]
  ).catch(() => [[]]);
  return (rows || [])
    .map((r) => ({
      districtName: String(r.district_name || '').trim(),
      schoolCount: Number(r.school_count) || 0
    }))
    .filter((r) => r.districtName);
}

export async function listSchoolIdsForDistrict(agencyId, districtName) {
  const aid = Number(agencyId);
  const district = String(districtName || '').trim();
  if (!aid || !district) return [];
  const [rows] = await pool.execute(
    `SELECT sp.school_organization_id AS id
     FROM school_profiles sp
     INNER JOIN agencies org ON org.id = sp.school_organization_id
     WHERE LOWER(TRIM(sp.district_name)) = LOWER(?)
       AND (org.is_archived = FALSE OR org.is_archived IS NULL)
       AND (
         EXISTS (
           SELECT 1 FROM organization_affiliations oa
           WHERE oa.organization_id = sp.school_organization_id
             AND oa.agency_id = ? AND oa.is_active = TRUE
         )
         OR EXISTS (
           SELECT 1 FROM agency_schools asx
           WHERE asx.school_organization_id = sp.school_organization_id
             AND asx.agency_id = ? AND asx.is_active = TRUE
         )
       )`,
    [district, aid, aid]
  ).catch(() => [[]]);
  return (rows || []).map((r) => Number(r.id)).filter((id) => Number.isFinite(id) && id > 0);
}

/**
 * Fan-out one school event (holiday/day off/etc.) to every school in a district.
 * Returns created events + shared districtBroadcastId.
 */
export async function createDistrictSchoolEvents({
  agencyId,
  userId,
  districtName,
  category,
  title,
  description,
  startsAt,
  endsAt,
  timezone,
  employeeReportTime = null,
  skillBuilderDirectHours = 0,
  minProvidersPerSession = 2,
  detailsUrl = null,
  schoolEventStatus = 'scheduled'
}) {
  const schoolIds = await listSchoolIdsForDistrict(agencyId, districtName);
  if (!schoolIds.length) {
    throw Object.assign(
      new Error(`No schools found for district "${String(districtName || '').trim()}"`),
      { status: 404 }
    );
  }
  const broadcastId = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
  const events = [];
  const errors = [];
  for (const organizationId of schoolIds) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const event = await createSchoolPortalEvent({
        agencyId,
        organizationId,
        userId,
        title,
        description,
        category,
        startsAt,
        endsAt,
        timezone,
        outreachTableInvited: false,
        schoolEventStatus,
        employeeReportTime,
        skillBuilderDirectHours,
        minProvidersPerSession,
        detailsUrl,
        districtBroadcastId: broadcastId
      });
      events.push(event);
    } catch (e) {
      errors.push({
        organizationId,
        message: e?.message || 'Failed to create event'
      });
    }
  }
  if (!events.length) {
    throw Object.assign(
      new Error(errors[0]?.message || 'Failed to create district events'),
      { status: errors[0]?.status || 500, details: errors }
    );
  }
  return {
    districtBroadcastId: broadcastId,
    districtName: String(districtName || '').trim(),
    createdCount: events.length,
    schoolCount: schoolIds.length,
    events,
    errors
  };
}

/**
 * Update every active school event that shares a district_broadcast_id.
 * Shared fields (title, type, times, etc.) are applied to each school copy.
 */
export async function updateDistrictSchoolEvents({
  agencyId,
  districtBroadcastId,
  userId,
  title,
  description,
  category,
  startsAt,
  endsAt,
  timezone,
  outreachTableInvited,
  detailsUrl,
  schoolEventStatus,
  employeeReportTime,
  skillBuilderDirectHours,
  minProvidersPerSession
}) {
  const aid = Number(agencyId);
  const broadcastId = String(districtBroadcastId || '').trim();
  if (!aid || !broadcastId) {
    throw Object.assign(new Error('agencyId and districtBroadcastId are required'), { status: 400 });
  }

  const [rows] = await pool.execute(
    `SELECT id, organization_id, title, event_type
     FROM company_events
     WHERE agency_id = ?
       AND district_broadcast_id = ?
       AND is_active = 1
       AND event_type LIKE 'school\\_%'
     ORDER BY organization_id ASC`,
    [aid, broadcastId]
  );
  const targets = rows || [];
  if (!targets.length) {
    throw Object.assign(new Error('No district-wide school events found for this broadcast'), {
      status: 404
    });
  }

  const updated = [];
  const errors = [];
  for (const row of targets) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const event = await updateSchoolPortalEvent({
        eventId: Number(row.id),
        organizationId: Number(row.organization_id),
        agencyId: aid,
        userId,
        title,
        description,
        category,
        startsAt,
        endsAt,
        timezone,
        outreachTableInvited,
        detailsUrl,
        schoolEventStatus,
        employeeReportTime,
        skillBuilderDirectHours,
        minProvidersPerSession
      });
      updated.push(event);
    } catch (e) {
      errors.push({
        eventId: Number(row.id),
        organizationId: Number(row.organization_id),
        title: row.title || null,
        message: e?.message || 'Failed to update event'
      });
    }
  }

  if (!updated.length) {
    throw Object.assign(new Error(errors[0]?.message || 'Failed to update district events'), {
      status: errors[0]?.status || 500,
      details: errors
    });
  }

  return {
    districtBroadcastId: broadcastId,
    updatedCount: updated.length,
    schoolCount: targets.length,
    events: updated,
    errors
  };
}
