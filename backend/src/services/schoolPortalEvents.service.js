import crypto from 'crypto';
import pool from '../config/database.js';
import OrganizationAffiliation from '../models/OrganizationAffiliation.model.js';
import AgencySchool from '../models/AgencySchool.model.js';
import ProviderAvailabilityService from './providerAvailability.service.js';
import { materializeSessionsForEvent } from './companyEventSessionDates.service.js';

export const SCHOOL_PORTAL_EVENT_TYPES = new Set(['school_back_to_school', 'school_spring_event']);

export const SCHOOL_EVENT_CATEGORIES = ['back_to_school', 'spring'];

export function categoryToEventType(category) {
  const c = String(category || '').trim().toLowerCase();
  if (c === 'back_to_school') return 'school_back_to_school';
  if (c === 'spring') return 'school_spring_event';
  return null;
}

export function eventTypeToCategory(eventType) {
  const t = String(eventType || '').trim().toLowerCase();
  if (t === 'school_back_to_school') return 'back_to_school';
  if (t === 'school_spring_event') return 'spring';
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

function buildOutreachStaffingConfig() {
  return {
    enabled: true,
    minProvidersPerSession: 1,
    clientRule: { enabled: false, confirmedStepSize: 1, additionalProvidersPerStep: 0, threshold: null },
    groupRule: { enabled: false, baseProvidersForOneGroup: 0, additionalProvidersPerGroup: 0 },
    onCall: { enabled: false, leadHours: 0 },
    waitlist: { enabled: false },
    providerSignup: { enabled: true }
  };
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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    schoolName: schoolMeta.name || null,
    schoolSlug: schoolMeta.slug || null
  };
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
  flierFileUrl
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
  const existing = await findExistingSchoolEventForYear({ organizationId, eventType, year });
  if (existing) {
    throw Object.assign(
      new Error('This school already has an active event of this type for this year'),
      { status: 409 }
    );
  }

  let tz = String(timezone || '').trim();
  if (!tz) {
    try {
      tz = await ProviderAvailabilityService.resolveAgencyTimeZone({ agencyId });
    } catch {
      tz = 'UTC';
    }
  }

  const staffingConfig = outreachTableInvited ? buildOutreachStaffingConfig() : null;

  const [insertResult] = await pool.execute(
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
      staffingConfig ? JSON.stringify(staffingConfig) : null
    ]
  );

  const eventId = Number(insertResult.insertId);
  if (outreachTableInvited) {
    await materializeSessionsForEvent(pool, { companyEventId: eventId });
  }

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
  clearFlier
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

  const outreach =
    outreachTableInvited !== undefined
      ? !!outreachTableInvited
      : !!(existing.outreach_table_invited === 1 || existing.outreach_table_invited === true);

  let staffingConfig = existing.staffing_config_json;
  if (outreach) {
    staffingConfig = JSON.stringify(buildOutreachStaffingConfig());
  } else if (outreachTableInvited === false) {
    staffingConfig = null;
  }

  const nextImage =
    eventImageUrl !== undefined ? (eventImageUrl || null) : existing.event_image_url;
  let nextFlier = existing.flier_file_url;
  if (clearFlier) nextFlier = null;
  else if (flierFileUrl !== undefined) nextFlier = flierFileUrl || null;

  await pool.execute(
    `UPDATE company_events
     SET updated_by_user_id = ?, title = ?, description = ?, event_type = ?,
         starts_at = ?, ends_at = ?, timezone = ?, outreach_table_invited = ?,
         event_image_url = ?, flier_file_url = ?, staffing_config_json = ?
     WHERE id = ? AND agency_id = ? AND organization_id = ?`,
    [
      userId,
      String(title ?? existing.title).trim(),
      String(description ?? existing.description ?? '').trim() || null,
      eventType,
      start,
      end,
      String(timezone || existing.timezone || 'UTC').trim(),
      outreach ? 1 : 0,
      nextImage,
      nextFlier,
      staffingConfig,
      eventId,
      agencyId,
      organizationId
    ]
  );

  if (outreach) {
    await materializeSessionsForEvent(pool, { companyEventId: eventId });
  }

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
  return SCHOOL_EVENT_CATEGORIES.filter((c) => !posted.has(c));
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
