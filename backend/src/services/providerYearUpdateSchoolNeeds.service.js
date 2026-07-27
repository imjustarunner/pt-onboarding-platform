import pool from '../config/database.js';
import { listAffiliatedSchools } from './schoolCoverageMetrics.service.js';
import {
  getDrivingDistanceMeters,
  metersToMiles,
} from './googleDistance.service.js';

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

function safeInt(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}

function parseDaysJson(raw) {
  if (raw == null || raw === '') return [];
  let parsed = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  const allowed = new Set(WEEKDAYS);
  return parsed
    .map((d) => String(d || '').trim())
    .filter((d) => allowed.has(d));
}

function schoolHasLogo(school) {
  return Boolean(
    school?.logo_path ||
      school?.logoPath ||
      school?.logo_url ||
      school?.logoUrl ||
      school?.icon_file_path ||
      school?.iconFilePath
  );
}

function mapSchool(school) {
  if (!school) return null;
  const id = safeInt(school.id || school.schoolId);
  if (!id) return null;
  return {
    schoolOrganizationId: id,
    schoolName: school.name || school.schoolName || 'School',
    schoolSlug: school.slug || school.schoolSlug || school.portal_url || null,
    logoPath: school.logo_path || school.logoPath || null,
    logoUrl: school.logo_url || school.logoUrl || null,
    iconFilePath: school.icon_file_path || school.iconFilePath || school.icon_path || null,
  };
}

function formatAddressLine(parts = []) {
  return parts.map((p) => String(p || '').trim()).filter(Boolean).join(', ');
}

async function loadSchoolAddress(schoolOrganizationId) {
  const [rows] = await pool.execute(
    `SELECT id, name, street_address, city, state, postal_code, logo_path, logo_url
     FROM agencies
     WHERE id = ?
     LIMIT 1`,
    [schoolOrganizationId]
  );
  return rows?.[0] || null;
}

async function loadProviderHomeAddress(userId) {
  const [rows] = await pool.execute(
    `SELECT home_street_address, home_address_line2, home_city, home_state, home_postal_code
     FROM users
     WHERE id = ?
     LIMIT 1`,
    [userId]
  );
  return rows?.[0] || null;
}

/**
 * Home ↔ School round-trip miles (same Distance Matrix path as school mileage).
 * Does not subtract Home↔Office — this is travel distance to the school itself.
 */
export async function computeHomeSchoolRoundTripMiles(providerUserId, schoolOrganizationId) {
  const home = await loadProviderHomeAddress(providerUserId);
  const school = await loadSchoolAddress(schoolOrganizationId);
  if (!home || !school) return null;

  const homeAddr = formatAddressLine([
    home.home_street_address,
    home.home_address_line2,
    home.home_city,
    home.home_state,
    home.home_postal_code,
  ]);
  const schoolAddr = formatAddressLine([
    school.street_address,
    school.city,
    school.state,
    school.postal_code,
  ]);
  if (!homeAddr || !schoolAddr) return null;

  try {
    const oneWayMeters = await getDrivingDistanceMeters(homeAddr, schoolAddr);
    const miles = metersToMiles(oneWayMeters) * 2;
    return Math.round(miles * 100) / 100;
  } catch (e) {
    console.warn(
      '[pyuSchoolNeeds] distance lookup failed:',
      e?.code || e?.message || e
    );
    return null;
  }
}

export async function listSchoolsForNeedsPicker(agencyId) {
  const schools = await listAffiliatedSchools(agencyId, { orgType: 'school' });
  return (schools || [])
    .map(mapSchool)
    .filter((s) => s && schoolHasLogo(s));
}

function mapNeedRow(row, schoolMap = new Map()) {
  const schoolId = safeInt(row.school_organization_id);
  const school = schoolMap.get(schoolId) || {
    schoolOrganizationId: schoolId,
    schoolName: row.school_name || 'School',
    schoolSlug: row.school_slug || null,
    logoPath: row.logo_path || null,
    logoUrl: row.logo_url || null,
    iconFilePath: row.icon_file_path || null,
  };
  return {
    id: safeInt(row.id),
    agencyId: safeInt(row.agency_id),
    schoolOrganizationId: schoolId,
    schoolYear: row.school_year,
    title: row.title || null,
    body: row.body || null,
    slotsNeeded: Number(row.slots_needed || 1),
    days: parseDaysJson(row.days_json),
    status: row.status || 'open',
    postedByUserId: safeInt(row.posted_by_user_id),
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
    applicationCount: Number(row.application_count || 0),
    pendingApplicationCount: Number(row.pending_application_count || 0),
    school,
  };
}

async function buildSchoolMap(agencyId, schoolIds) {
  const affiliated = await listAffiliatedSchools(agencyId, { orgType: 'school' });
  const map = new Map();
  for (const s of affiliated || []) {
    const mapped = mapSchool(s);
    if (mapped) map.set(mapped.schoolOrganizationId, mapped);
  }
  const missing = (schoolIds || []).filter((id) => !map.has(id));
  if (missing.length) {
    const placeholders = missing.map(() => '?').join(',');
    const [rows] = await pool.execute(
      `SELECT a.id, a.name, a.slug, a.logo_path, a.logo_url, i.file_path AS icon_file_path
       FROM agencies a
       LEFT JOIN icons i ON i.id = a.icon_id
       WHERE a.id IN (${placeholders})`,
      missing
    );
    for (const r of rows || []) {
      const mapped = mapSchool(r);
      if (mapped) map.set(mapped.schoolOrganizationId, mapped);
    }
  }
  return map;
}

export async function listNeedsForAdmin({ agencyId, schoolYear }) {
  const [rows] = await pool.execute(
    `SELECT
       n.*,
       a.name AS school_name,
       a.slug AS school_slug,
       a.logo_path,
       a.logo_url,
       i.file_path AS icon_file_path,
       (SELECT COUNT(*) FROM provider_year_update_school_need_applications app WHERE app.need_id = n.id) AS application_count,
       (SELECT COUNT(*) FROM provider_year_update_school_need_applications app WHERE app.need_id = n.id AND app.status = 'pending') AS pending_application_count
     FROM provider_year_update_school_needs n
     INNER JOIN agencies a ON a.id = n.school_organization_id
     LEFT JOIN icons i ON i.id = a.icon_id
     WHERE n.agency_id = ? AND n.school_year = ?
     ORDER BY n.status = 'open' DESC, n.created_at DESC, n.id DESC`,
    [agencyId, schoolYear]
  );
  const schoolIds = (rows || []).map((r) => safeInt(r.school_organization_id)).filter(Boolean);
  const schoolMap = await buildSchoolMap(agencyId, schoolIds);
  return (rows || []).map((r) => mapNeedRow(r, schoolMap));
}

export async function createNeed({
  agencyId,
  schoolYear,
  schoolOrganizationId,
  title,
  body,
  slotsNeeded,
  days,
  postedByUserId,
}) {
  const picker = await listSchoolsForNeedsPicker(agencyId);
  const school = picker.find((s) => s.schoolOrganizationId === schoolOrganizationId);
  if (!school) {
    const err = new Error(
      'Select an affiliated school that has a logo on file. Schools without logos cannot be posted.'
    );
    err.code = 'SCHOOL_NEEDS_INVALID_SCHOOL';
    throw err;
  }

  const dayList = parseDaysJson(days);
  const slots = Math.max(1, Math.min(50, Number(slotsNeeded) || 1));
  const [result] = await pool.execute(
    `INSERT INTO provider_year_update_school_needs
       (agency_id, school_organization_id, school_year, title, body, slots_needed, days_json, status, posted_by_user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?)`,
    [
      agencyId,
      schoolOrganizationId,
      schoolYear,
      title ? String(title).slice(0, 255) : null,
      body ? String(body).slice(0, 4000) : null,
      slots,
      JSON.stringify(dayList),
      postedByUserId || null,
    ]
  );
  const id = safeInt(result?.insertId);
  const [rows] = await pool.execute(
    `SELECT n.*, a.name AS school_name, a.slug AS school_slug, a.logo_path, a.logo_url, i.file_path AS icon_file_path
     FROM provider_year_update_school_needs n
     INNER JOIN agencies a ON a.id = n.school_organization_id
     LEFT JOIN icons i ON i.id = a.icon_id
     WHERE n.id = ?
     LIMIT 1`,
    [id]
  );
  const schoolMap = await buildSchoolMap(agencyId, [schoolOrganizationId]);
  return mapNeedRow(rows[0], schoolMap);
}

export async function updateNeed({ needId, agencyId, patch = {} }) {
  const [existing] = await pool.execute(
    `SELECT * FROM provider_year_update_school_needs WHERE id = ? AND agency_id = ? LIMIT 1`,
    [needId, agencyId]
  );
  const row = existing?.[0];
  if (!row) {
    const err = new Error('School need not found');
    err.code = 'SCHOOL_NEED_NOT_FOUND';
    throw err;
  }

  const title = patch.title !== undefined ? (patch.title ? String(patch.title).slice(0, 255) : null) : row.title;
  const body = patch.body !== undefined ? (patch.body ? String(patch.body).slice(0, 4000) : null) : row.body;
  const slotsNeeded =
    patch.slotsNeeded !== undefined
      ? Math.max(1, Math.min(50, Number(patch.slotsNeeded) || 1))
      : row.slots_needed;
  const days =
    patch.days !== undefined
      ? JSON.stringify(parseDaysJson(patch.days))
      : JSON.stringify(parseDaysJson(row.days_json));
  const status = patch.status !== undefined ? String(patch.status) : row.status;
  if (!['open', 'filled', 'closed'].includes(status)) {
    const err = new Error('Invalid status');
    err.code = 'SCHOOL_NEED_INVALID_STATUS';
    throw err;
  }

  await pool.execute(
    `UPDATE provider_year_update_school_needs
     SET title = ?, body = ?, slots_needed = ?, days_json = ?, status = ?
     WHERE id = ? AND agency_id = ?`,
    [title, body, slotsNeeded, days, status, needId, agencyId]
  );

  const list = await listNeedsForAdmin({ agencyId, schoolYear: row.school_year });
  return list.find((n) => n.id === needId) || null;
}

export async function listApplicationsForNeed({ needId, agencyId }) {
  const [needRows] = await pool.execute(
    `SELECT id FROM provider_year_update_school_needs WHERE id = ? AND agency_id = ? LIMIT 1`,
    [needId, agencyId]
  );
  if (!needRows?.[0]) {
    const err = new Error('School need not found');
    err.code = 'SCHOOL_NEED_NOT_FOUND';
    throw err;
  }

  const [rows] = await pool.execute(
    `SELECT
       app.*,
       u.first_name,
       u.last_name,
       u.email,
       u.phone
     FROM provider_year_update_school_need_applications app
     INNER JOIN users u ON u.id = app.provider_user_id
     WHERE app.need_id = ?
     ORDER BY
       FIELD(app.status, 'pending', 'approved', 'denied', 'withdrawn'),
       app.created_at DESC`,
    [needId]
  );

  return (rows || []).map((r) => ({
    id: safeInt(r.id),
    needId: safeInt(r.need_id),
    providerUserId: safeInt(r.provider_user_id),
    providerName: [r.first_name, r.last_name].filter(Boolean).join(' ') || r.email || 'Provider',
    email: r.email || null,
    phone: r.phone || null,
    preferredDay: r.preferred_day || null,
    notes: r.notes || null,
    homeSchoolRoundtripMiles:
      r.home_school_roundtrip_miles != null ? Number(r.home_school_roundtrip_miles) : null,
    status: r.status || 'pending',
    reviewedByUserId: safeInt(r.reviewed_by_user_id),
    reviewedAt: r.reviewed_at || null,
    createdAt: r.created_at || null,
  }));
}

export async function reviewApplication({ applicationId, agencyId, status, reviewedByUserId }) {
  if (!['approved', 'denied', 'pending'].includes(status)) {
    const err = new Error('Invalid application status');
    err.code = 'SCHOOL_NEED_APP_INVALID_STATUS';
    throw err;
  }
  const [rows] = await pool.execute(
    `SELECT app.*, n.agency_id
     FROM provider_year_update_school_need_applications app
     INNER JOIN provider_year_update_school_needs n ON n.id = app.need_id
     WHERE app.id = ? AND n.agency_id = ?
     LIMIT 1`,
    [applicationId, agencyId]
  );
  if (!rows?.[0]) {
    const err = new Error('Application not found');
    err.code = 'SCHOOL_NEED_APP_NOT_FOUND';
    throw err;
  }
  await pool.execute(
    `UPDATE provider_year_update_school_need_applications
     SET status = ?,
         reviewed_by_user_id = ?,
         reviewed_at = CASE WHEN ? = 'pending' THEN NULL ELSE NOW() END
     WHERE id = ?`,
    [status, status === 'pending' ? null : reviewedByUserId || null, status, applicationId]
  );
  const apps = await listApplicationsForNeed({ needId: rows[0].need_id, agencyId });
  return apps.find((a) => a.id === applicationId) || null;
}

export async function listOpenNeedsForProvider({ agencyId, schoolYear, providerUserId }) {
  const [rows] = await pool.execute(
    `SELECT
       n.*,
       a.name AS school_name,
       a.slug AS school_slug,
       a.logo_path,
       a.logo_url,
       i.file_path AS icon_file_path,
       app.id AS my_application_id,
       app.status AS my_application_status,
       app.preferred_day AS my_preferred_day,
       app.notes AS my_notes,
       app.home_school_roundtrip_miles AS my_roundtrip_miles,
       app.created_at AS my_applied_at
     FROM provider_year_update_school_needs n
     INNER JOIN agencies a ON a.id = n.school_organization_id
     LEFT JOIN icons i ON i.id = a.icon_id
     LEFT JOIN provider_year_update_school_need_applications app
       ON app.need_id = n.id AND app.provider_user_id = ?
     WHERE n.agency_id = ?
       AND n.school_year = ?
       AND (n.status = 'open' OR app.id IS NOT NULL)
     ORDER BY n.status = 'open' DESC, n.created_at DESC, n.id DESC`,
    [providerUserId, agencyId, schoolYear]
  );

  const schoolIds = (rows || []).map((r) => safeInt(r.school_organization_id)).filter(Boolean);
  const schoolMap = await buildSchoolMap(agencyId, schoolIds);

  const needs = [];
  for (const r of rows || []) {
    const base = mapNeedRow(r, schoolMap);
    let roundTrip = r.my_roundtrip_miles != null ? Number(r.my_roundtrip_miles) : null;
    if (roundTrip == null && providerUserId) {
      roundTrip = await computeHomeSchoolRoundTripMiles(providerUserId, base.schoolOrganizationId);
    }
    needs.push({
      ...base,
      homeSchoolRoundtripMiles: roundTrip,
      myApplication: r.my_application_id
        ? {
            id: safeInt(r.my_application_id),
            status: r.my_application_status || 'pending',
            preferredDay: r.my_preferred_day || null,
            notes: r.my_notes || null,
            homeSchoolRoundtripMiles:
              r.my_roundtrip_miles != null ? Number(r.my_roundtrip_miles) : roundTrip,
            createdAt: r.my_applied_at || null,
          }
        : null,
    });
  }
  return needs;
}

export async function applyToNeed({
  needId,
  providerUserId,
  preferredDay,
  notes,
}) {
  const [needRows] = await pool.execute(
    `SELECT * FROM provider_year_update_school_needs WHERE id = ? LIMIT 1`,
    [needId]
  );
  const need = needRows?.[0];
  if (!need || need.status !== 'open') {
    const err = new Error('This school need is not open for applications');
    err.code = 'SCHOOL_NEED_NOT_OPEN';
    throw err;
  }

  const requiredDays = parseDaysJson(need.days_json);
  let preferred = preferredDay ? String(preferredDay).trim() : null;
  if (requiredDays.length) {
    if (preferred && !requiredDays.includes(preferred)) {
      const err = new Error(`Preferred day must be one of: ${requiredDays.join(', ')}`);
      err.code = 'SCHOOL_NEED_DAY_REQUIRED';
      throw err;
    }
    // If a day is posted, store the posted day(s) context; single-day posts use that day.
    if (!preferred && requiredDays.length === 1) preferred = requiredDays[0];
    if (!preferred) {
      const err = new Error('Select which posted day you can work');
      err.code = 'SCHOOL_NEED_DAY_REQUIRED';
      throw err;
    }
  } else {
    if (!preferred || !WEEKDAYS.includes(preferred)) {
      const err = new Error('Please choose your preferred weekday for this school');
      err.code = 'SCHOOL_NEED_DAY_REQUIRED';
      throw err;
    }
  }

  const miles = await computeHomeSchoolRoundTripMiles(
    providerUserId,
    safeInt(need.school_organization_id)
  );

  try {
    await pool.execute(
      `INSERT INTO provider_year_update_school_need_applications
         (need_id, provider_user_id, preferred_day, notes, home_school_roundtrip_miles, status)
       VALUES (?, ?, ?, ?, ?, 'pending')
       ON DUPLICATE KEY UPDATE
         preferred_day = VALUES(preferred_day),
         notes = VALUES(notes),
         home_school_roundtrip_miles = COALESCE(VALUES(home_school_roundtrip_miles), home_school_roundtrip_miles),
         status = IF(status = 'withdrawn', 'pending', status),
         updated_at = CURRENT_TIMESTAMP`,
      [
        needId,
        providerUserId,
        preferred,
        notes ? String(notes).slice(0, 2000) : null,
        miles,
      ]
    );
  } catch (e) {
    throw e;
  }

  const list = await listOpenNeedsForProvider({
    agencyId: safeInt(need.agency_id),
    schoolYear: need.school_year,
    providerUserId,
  });
  return list.find((n) => n.id === needId) || null;
}

export async function withdrawApplication({ needId, providerUserId }) {
  const [result] = await pool.execute(
    `UPDATE provider_year_update_school_need_applications
     SET status = 'withdrawn', updated_at = CURRENT_TIMESTAMP
     WHERE need_id = ? AND provider_user_id = ? AND status IN ('pending', 'approved')`,
    [needId, providerUserId]
  );
  return Number(result?.affectedRows || 0) > 0;
}

export { WEEKDAYS, parseDaysJson };
