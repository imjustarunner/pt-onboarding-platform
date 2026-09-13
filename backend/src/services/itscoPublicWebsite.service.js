import pool from '../config/database.js';
import { readItscoImpact, writeItscoImpactBaseline } from './itscoPublicImpact.service.js';
import { getMarketingPageRowBySlug } from './publicMarketingHub.service.js';
import { resolveOrgLogoUrl, requestBaseUrl } from './publicFormBranding.service.js';
import { publicUploadsUrlFromStoredPath } from '../utils/uploads.js';
import { resolveCanonicalDistrict } from '../utils/districtSlug.shared.js';
import ProviderPublicProfile from '../models/ProviderPublicProfile.model.js';
import { listClinicalFacetsForUser } from './providerClinicalFacets.service.js';
import { listProviderAcceptedInsurancesForDisplay } from './providerAcceptedInsurance.service.js';
import { assembleSchoolDistricts, publicPerson, parseWebsiteSettings } from '../utils/itscoPublicWebsite.js';

const ACTIVE_PERSON = `COALESCE(u.is_archived, 0) = 0 AND COALESCE(u.is_demo, 0) = 0
 AND COALESCE(u.is_active, 1) = 1 AND UPPER(COALESCE(u.status, '')) IN ('ACTIVE', 'ACTIVE_EMPLOYEE')`;
const AFFILIATED = `SELECT organization_id AS school_id FROM organization_affiliations WHERE agency_id = ? AND is_active = 1
 UNION SELECT school_organization_id AS school_id FROM agency_schools WHERE agency_id = ? AND is_active = 1`;

export async function resolveItscoWebsite() {
  const page = await getMarketingPageRowBySlug('itsco');
  if (!page?.isActive) throw Object.assign(new Error('ITSCO website is not published'), { status: 404 });
  const [agencies] = await pool.execute(`SELECT id, name, official_name, slug, logo_url, logo_path, public_availability_enabled
    FROM agencies WHERE LOWER(slug) = 'itsco' AND LOWER(organization_type) = 'agency'
      AND is_active = 1 AND COALESCE(is_archived, 0) = 0 LIMIT 1`);
  if (!agencies[0]) throw Object.assign(new Error('ITSCO is not available'), { status: 404 });
  return { agency: agencies[0], page, settings: parseWebsiteSettings(page.brandingJson) };
}

export async function getItscoWebsiteData(req) {
  const { agency, page, settings } = await resolveItscoWebsite();
  const baseUrl = requestBaseUrl(req);
  // A school must have a real portal account, not just an outreach/directory entry.
  const [schoolRows] = await pool.execute(`SELECT org.id, org.name, org.slug, org.logo_url, org.logo_path, org.city, org.state,
    COALESCE(NULLIF(sp.district_name, ''), ad.name) AS district_name
    FROM agencies org JOIN (${AFFILIATED}) aff ON aff.school_id = org.id
    LEFT JOIN school_profiles sp ON sp.school_organization_id = org.id
    LEFT JOIN agency_districts ad ON ad.id = sp.district_id AND ad.agency_id = ?
    WHERE org.organization_type = 'school' AND COALESCE(org.is_archived, 0) = 0
      AND EXISTS (SELECT 1 FROM user_agencies ua JOIN users u ON u.id = ua.user_id
        WHERE ua.agency_id = org.id AND COALESCE(ua.is_active, 1) = 1 AND u.role = 'school_staff' AND ${ACTIVE_PERSON})
      AND NOT EXISTS (SELECT 1 FROM district_schedule_hidden_schools h WHERE h.agency_id = ? AND h.school_organization_id = org.id)
    ORDER BY org.name`, [agency.id, agency.id, agency.id, agency.id]);
  const districts = assembleSchoolDistricts(schoolRows, settings.districts, resolveCanonicalDistrict,
    row => resolveOrgLogoUrl(row, { baseUrl }));
  const schools = districts.flatMap(d => d.schools);
  const ids = schools.map(s => s.id);
  let assignments = [];
  if (ids.length) {
    [assignments] = await pool.execute(`SELECT DISTINCT psa.school_organization_id AS schoolId, psa.provider_user_id AS providerId, psa.slots_available
      FROM provider_school_assignments psa
      WHERE psa.is_active = 1 AND psa.school_organization_id IN (${ids.map(() => '?').join(',')})
      AND NOT EXISTS (SELECT 1 FROM district_schedule_hidden_providers h WHERE h.agency_id = ?
        AND h.school_organization_id = psa.school_organization_id AND h.provider_user_id = psa.provider_user_id)`, [...ids, agency.id]);
  }
  const [people] = await pool.execute(`SELECT u.id, u.first_name, u.last_name, COALESCE(NULLIF(u.title, ''), ua.agency_position) AS title, u.credential, u.department,
      u.profile_photo_path, u.provider_accepting_new_clients, COALESCE(NULLIF(ua.agency_role, ''), u.role) AS role, u.in_office_available,
      EXISTS (SELECT 1 FROM provider_public_service_enrollments e JOIN agency_public_service_types st
        ON st.agency_id = e.agency_id AND st.service_type = e.service_type AND st.is_enabled = 1
        WHERE e.agency_id = ua.agency_id AND e.user_id = u.id AND e.is_active = 1 AND e.service_type = 'counseling') AS enrolled
    FROM users u JOIN user_agencies ua ON ua.user_id = u.id
    WHERE ua.agency_id = ? AND COALESCE(ua.is_active, 1) = 1 AND ${ACTIVE_PERSON}
    ORDER BY u.last_name, u.first_name`, [agency.id]);
  const providers = []; const team = [];
  // Bound parallel work: public pages must not exhaust the shared DB pool.
  for (let start = 0; start < people.length; start += 5) {
    await Promise.all(people.slice(start, start + 5).map(async row => {
      const assignedIds = new Set(assignments.filter(a => Number(a.providerId) === Number(row.id)).map(a => Number(a.schoolId)));
      const assignedSchools = schools.filter(s => assignedIds.has(s.id));
      const isProvider = assignedSchools.length > 0 || (row.enrolled && agency.public_availability_enabled);
      const isTeam = ['admin', 'super_admin', 'support', 'staff', 'cpa', 'clinical_practice_assistant', 'provider_plus'].includes(row.role);
      if (!isProvider && !isTeam) return;
      const profile = await ProviderPublicProfile.getForProvider({ providerUserId: row.id });
      const person = publicPerson(row, profile, publicUploadsUrlFromStoredPath);
      if (isTeam) team.push(person);
      if (!isProvider) return;
      const [facets, accepted] = await Promise.all([
        listClinicalFacetsForUser(Number(row.id), { agencyId: agency.id }),
        listProviderAcceptedInsurancesForDisplay({ userId: row.id, agencyId: agency.id })
      ]);
      const insurances = accepted.map(i => ({ name: i.name, logoUrl: i.logo_url || null }));
      for (const name of profile?.insurances || []) if (!insurances.some(i => i.name.toLowerCase() === name.toLowerCase())) insurances.push({ name });
      providers.push({ ...person, specialties: facets.specialties || [], ageGroups: facets.ageGroups || [],
        modalities: facets.modalities || [], populations: facets.populations || [], insurances,
        schools: assignedSchools.map(s => ({ id: s.id, name: s.name, logoUrl: s.logoUrl })),
        office: Boolean(row.in_office_available), schoolOpenings: assignments.some(a => Number(a.providerId) === Number(row.id) && Number(a.slots_available) > 0),
        onlineScheduling: Boolean(row.enrolled && agency.public_availability_enabled) });
    }));
  }
  providers.sort((a,b) => a.displayName.localeCompare(b.displayName));
  team.sort((a,b) => a.displayName.localeCompare(b.displayName));
  for (const school of schools) school.providerIds = providers.filter(p => p.schools.some(s => s.id === school.id)).map(p => p.id);
  const impact = await readItscoImpact(pool, { agencyId: agency.id, schoolIds: ids });
  const studentsSupported = impact?.total ?? null;
  return { agency: { id: agency.id, name: agency.official_name || agency.name, slug: 'itsco',
    logoUrl: resolveOrgLogoUrl(agency, { baseUrl }), schedulingEnabled: Boolean(agency.public_availability_enabled) },
    content: { heroTitle: page.heroTitle, heroSubtitle: page.heroSubtitle, heroImageUrl: page.heroImageUrl },
    settings, districts, providers, team,
    insurances: [...new Map(providers.flatMap(p => p.insurances).map(i => [i.name.toLowerCase(), i])).values()],
    metrics: { schools: schools.length, districts: districts.filter(d => d.slug !== 'other').length,
      providers: providers.length, teamMembers: new Set([...providers, ...team].map(p => p.id)).size,
      studentsSupported, baselineAt: impact?.baselineAt || null }, updatedAt: new Date().toISOString() };
}

export async function saveItscoImpactBaseline(req, res, next) {
  try {
    const total = Number(req.body.studentTotal);
    if (!Number.isSafeInteger(total) || total < 0 || total > 100000000 || typeof req.body.studentTotal !== 'number') {
      return res.status(400).json({ error: { message: 'Enter a whole-number total of students supported through today.' } });
    }
    const data = await getItscoWebsiteData(req);
    const agency = data.agency;
    const schoolIds = data.districts.flatMap(d => d.schools.map(s => s.id));
    await writeItscoImpactBaseline(pool, { agencyId: agency.id, schoolIds, total, actorId: req.user.id });
    res.json({ ok: true, studentTotal: total });
  } catch (e) { next(e); }
}
