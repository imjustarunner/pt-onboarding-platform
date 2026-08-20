import pool from '../config/database.js';
import Agency from '../models/Agency.model.js';
import config from '../config/config.js';
import { listAffiliatedSchools } from './schoolCoverageMetrics.service.js';
import {
  buildPublicFormBrandingForAgencyId,
  resolveOrgLogoUrl,
  requestBaseUrl
} from './publicFormBranding.service.js';
import { buildPublicDistrictScheduleUrl } from '../utils/publicPortalUrl.js';
import { publicUploadsUrlFromStoredPath } from '../utils/uploads.js';
import {
  slugifyDistrictName,
  normalizeDistrictName,
  resolveCanonicalDistrict,
  mergeDistrictRows
} from '../utils/districtSlug.shared.js';

const WEEKDAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const DEMO_SCHOOL_SLUGS = new Set(['hogwarts', 'durmstrang']);
const DEMO_SCHOOL_NAME_RE = /\bfake\b|\bdemo\b|\btest school\b|\bhogwarts\b|\bdurmstrang\b/i;

async function resolveAgencyBySlug(agencySlug) {
  const slug = String(agencySlug || '').trim().toLowerCase();
  if (!slug) return null;
  const org = await Agency.findBySlug(slug);
  if (!org?.id) return null;
  if (org.is_active === false || org.is_active === 0) return null;
  const orgType = String(org.organization_type || 'agency').toLowerCase();
  if (!orgType || orgType === 'agency') return org;
  return null;
}

function affiliatedSchoolIdsSubquery() {
  return `
    SELECT organization_id AS school_id FROM organization_affiliations
    WHERE agency_id = ? AND is_active = TRUE
    UNION
    SELECT school_organization_id AS school_id FROM agency_schools
    WHERE agency_id = ? AND is_active = TRUE`;
}

export async function ensureAgencyDistrictsSynced(agencyId) {
  const aid = Number(agencyId);
  if (!Number.isFinite(aid) || aid <= 0) return;

  const [rows] = await pool.execute(
    `SELECT DISTINCT TRIM(sp.district_name) AS district_name
     FROM school_profiles sp
     INNER JOIN (${affiliatedSchoolIdsSubquery()}) aff ON aff.school_id = sp.school_organization_id
     WHERE sp.district_name IS NOT NULL AND TRIM(sp.district_name) <> ''`,
    [aid, aid]
  );

  const names = new Set((rows || []).map((r) => normalizeDistrictName(r.district_name)));
  if (!names.size) return;

  for (const name of names) {
    let slug = slugifyDistrictName(name);
    const [existingSlug] = await pool.execute(
      `SELECT id FROM agency_districts WHERE agency_id = ? AND slug = ? LIMIT 1`,
      [aid, slug]
    );
    if (existingSlug?.[0]?.id) {
      await pool.execute(
        `UPDATE agency_districts SET name = ? WHERE id = ?`,
        [name, existingSlug[0].id]
      );
      continue;
    }
    const [nameRow] = await pool.execute(
      `SELECT id, slug FROM agency_districts WHERE agency_id = ? AND name = ? LIMIT 1`,
      [aid, name]
    );
    if (nameRow?.[0]?.id) {
      await pool.execute(`UPDATE agency_districts SET slug = ? WHERE id = ?`, [slug, nameRow[0].id]);
      continue;
    }
    let attempt = slug;
    let n = 2;
    while (true) {
      try {
        await pool.execute(
          `INSERT INTO agency_districts (agency_id, name, slug) VALUES (?, ?, ?)`,
          [aid, name, attempt]
        );
        break;
      } catch (err) {
        if (err?.code !== 'ER_DUP_ENTRY') throw err;
        attempt = `${slug}-${n}`;
        n += 1;
      }
    }
  }

  await pool.execute(
    `UPDATE school_profiles sp
     INNER JOIN (${affiliatedSchoolIdsSubquery()}) aff ON aff.school_id = sp.school_organization_id
     INNER JOIN agency_districts ad
       ON ad.agency_id = ?
      AND ad.name COLLATE utf8mb4_unicode_ci = TRIM(sp.district_name) COLLATE utf8mb4_unicode_ci
     SET sp.district_id = ad.id
     WHERE sp.district_name IS NOT NULL AND TRIM(sp.district_name) <> ''`,
    [aid, aid, aid]
  );
}

export async function listDistrictScheduleLinks(agencyId, req = null) {
  const agency = await Agency.findById(agencyId);
  if (!agency?.id) {
    const err = new Error('Organization not found');
    err.status = 404;
    throw err;
  }
  await ensureAgencyDistrictsSynced(agency.id);

  const [rows] = await pool.execute(
    `SELECT ad.id, ad.name, ad.slug,
            COUNT(DISTINCT sp.school_organization_id) AS school_count
     FROM agency_districts ad
     LEFT JOIN school_profiles sp ON sp.district_id = ad.id
     LEFT JOIN (${affiliatedSchoolIdsSubquery()}) aff ON aff.school_id = sp.school_organization_id
     WHERE ad.agency_id = ?
     GROUP BY ad.id, ad.name, ad.slug
     HAVING school_count > 0
     ORDER BY ad.name ASC`,
    [agency.id, agency.id, agency.id]
  );

  const districts = mergeDistrictRows(rows || []).map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    schoolCount: row.schoolCount,
    publicUrl: buildPublicDistrictScheduleUrl(agency, row.slug, { platformBaseUrl: requestBaseUrl(req) })
  }));

  return {
    agency: {
      id: agency.id,
      name: agency.official_name || agency.name,
      slug: agency.slug || agency.portal_url
    },
    districts
  };
}

export async function listPublicDistrictDirectory(agencySlug, req = null) {
  const agency = await resolveAgencyBySlug(agencySlug);
  if (!agency) {
    const err = new Error('Organization not found');
    err.status = 404;
    throw err;
  }
  await ensureAgencyDistrictsSynced(agency.id);

  const baseUrl = requestBaseUrl(req) || String(config.backendUrl || '').replace(/\/$/, '');
  const branding = await buildPublicFormBrandingForAgencyId(agency.id, { baseUrl });

  const [rows] = await pool.execute(
    `SELECT ad.name, ad.slug,
            COUNT(DISTINCT sp.school_organization_id) AS school_count
     FROM agency_districts ad
     LEFT JOIN school_profiles sp ON sp.district_id = ad.id
     LEFT JOIN (${affiliatedSchoolIdsSubquery()}) aff ON aff.school_id = sp.school_organization_id
     WHERE ad.agency_id = ?
     GROUP BY ad.id, ad.name, ad.slug
     HAVING school_count > 0
     ORDER BY ad.name ASC`,
    [agency.id, agency.id, agency.id]
  );

  const districts = mergeDistrictRows(rows || []).map((row) => ({
    name: row.name,
    slug: row.slug,
    schoolCount: row.schoolCount,
    publicUrl: buildPublicDistrictScheduleUrl(agency, row.slug, { platformBaseUrl: requestBaseUrl(req) })
  }));

  return {
    agency: {
      id: agency.id,
      name: agency.official_name || agency.name,
      slug: agency.slug || agency.portal_url,
      branding
    },
    districts
  };
}

export async function getPublicDistrictSchedule(agencySlug, districtSlug, req = null) {
  const agency = await resolveAgencyBySlug(agencySlug);
  if (!agency) {
    const err = new Error('Organization not found');
    err.status = 404;
    throw err;
  }
  await ensureAgencyDistrictsSynced(agency.id);

  const slug = String(districtSlug || '').trim().toLowerCase();
  const [allDistrictRows] = await pool.execute(
    `SELECT id, name, slug FROM agency_districts WHERE agency_id = ?`,
    [agency.id]
  );
  const canonical = resolveCanonicalDistrict(slug);
  const matching = (allDistrictRows || []).filter((row) => {
    const rowCanonical = resolveCanonicalDistrict(row.slug || row.name);
    return rowCanonical.canonicalSlug === canonical.canonicalSlug
      || String(row.slug || '').toLowerCase() === slug;
  });
  if (!matching.length) {
    const err = new Error('District not found');
    err.status = 404;
    throw err;
  }
  const district = {
    id: matching[0].id,
    name: canonical.canonicalName || matching[0].name,
    slug: canonical.canonicalSlug || matching[0].slug
  };
  const matchingIds = matching.map((row) => Number(row.id)).filter(Boolean);

  const baseUrl = requestBaseUrl(req) || String(config.backendUrl || '').replace(/\/$/, '');
  const branding = await buildPublicFormBrandingForAgencyId(agency.id, { baseUrl });
  const affiliated = await listAffiliatedSchools(agency.id, { orgType: 'school' });
  const affiliatedIds = affiliated.map((s) => Number(s.id)).filter(Boolean);
  if (!affiliatedIds.length) {
    return {
      agency: { id: agency.id, name: agency.official_name || agency.name, slug: agency.slug || agency.portal_url, branding },
      district: { name: district.name, slug: district.slug },
      schools: [],
      refreshedAt: new Date().toISOString()
    };
  }

  const placeholders = affiliatedIds.map(() => '?').join(', ');
  const districtPlaceholders = matchingIds.map(() => '?').join(', ');
  const [schoolRows] = await pool.execute(
    `SELECT org.id, org.name, org.slug, org.portal_url, org.logo_path, org.logo_url, org.city, org.state
     FROM agencies org
     INNER JOIN school_profiles sp ON sp.school_organization_id = org.id
     WHERE sp.district_id IN (${districtPlaceholders})
       AND org.id IN (${placeholders})
       AND (org.is_active = TRUE OR org.is_active IS NULL)
     ORDER BY org.name ASC`,
    [...matchingIds, ...affiliatedIds]
  );

  const schools = [];
  const schoolById = new Map();
  for (const row of schoolRows || []) {
    const schoolSlug = String(row.slug || row.portal_url || '').trim().toLowerCase();
    if (DEMO_SCHOOL_SLUGS.has(schoolSlug) || DEMO_SCHOOL_NAME_RE.test(String(row.name || ''))) continue;
    const school = {
      id: Number(row.id),
      name: String(row.name || '').trim() || `School #${row.id}`,
      slug: schoolSlug || null,
      city: row.city || null,
      state: row.state || null,
      logoUrl: resolveOrgLogoUrl(row, { baseUrl }),
      providers: []
    };
    schools.push(school);
    schoolById.set(school.id, school);
  }

  if (schoolById.size) {
    const schoolIds = [...schoolById.keys()];
    const schoolPlaceholders = schoolIds.map(() => '?').join(', ');
    const [assignmentRows] = await pool.execute(
      `SELECT
         psa.school_organization_id AS school_id,
         psa.provider_user_id,
         psa.day_of_week,
         u.first_name,
         u.last_name,
         u.profile_photo_path
       FROM provider_school_assignments psa
       INNER JOIN users u ON u.id = psa.provider_user_id
       WHERE psa.is_active = TRUE
         AND psa.school_organization_id IN (${schoolPlaceholders})
         AND (u.is_archived IS NULL OR u.is_archived = FALSE)
         AND UPPER(COALESCE(u.status, '')) NOT IN ('ARCHIVED', 'INACTIVE_EMPLOYEE', 'PROSPECTIVE')
       ORDER BY psa.school_organization_id, u.last_name, u.first_name, psa.day_of_week`,
      schoolIds
    );

    const providerMapBySchool = new Map();
    for (const row of assignmentRows || []) {
      const schoolId = Number(row.school_id);
      const school = schoolById.get(schoolId);
      if (!school) continue;
      const uid = Number(row.provider_user_id);
      if (!providerMapBySchool.has(schoolId)) providerMapBySchool.set(schoolId, new Map());
      const pmap = providerMapBySchool.get(schoolId);
      if (!pmap.has(uid)) {
        const displayName = `${row.first_name || ''} ${row.last_name || ''}`.trim() || 'Provider';
        const photoPath = row.profile_photo_path || null;
        pmap.set(uid, {
          id: uid,
          displayName,
          photoUrl: publicUploadsUrlFromStoredPath(photoPath),
          days: []
        });
      }
      const day = String(row.day_of_week || '').trim();
      if (day && !pmap.get(uid).days.includes(day)) {
        pmap.get(uid).days.push(day);
      }
    }

    for (const school of schools) {
      const pmap = providerMapBySchool.get(school.id);
      if (!pmap) continue;
      school.providers = [...pmap.values()]
        .map((p) => ({
          ...p,
          days: WEEKDAY_ORDER.filter((d) => p.days.includes(d))
        }))
        .sort((a, b) => a.displayName.localeCompare(b.displayName));
    }
  }

  return {
    agency: {
      id: agency.id,
      name: agency.official_name || agency.name,
      slug: agency.slug || agency.portal_url,
      branding
    },
    district: {
      name: district.name,
      slug: district.slug
    },
    schools,
    refreshedAt: new Date().toISOString()
  };
}
