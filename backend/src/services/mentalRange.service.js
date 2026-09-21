import {publicSchoolAssignmentSql} from '../utils/providerDirectoryEligibility.js';
import {agencyAvailability,scopeProviderRow} from '../utils/providerAgencyAvailability.js';
import {offersProviderService} from '../utils/providerServiceOfferings.js';
import { isTenantOrganizationType } from '../utils/tenantOrganizations.js';

export const RANGE_SERVICES = ['counseling', 'tutoring', 'coaching'];
export const RANGE_TENANT_SQL = `LOWER(COALESCE(a.organization_type, 'agency')) IN ('agency','clubwebapp','life_coach','consultant')
 AND LOWER(CONCAT(COALESCE(a.name,''),' ',COALESCE(a.slug,''))) NOT REGEXP 'demo|burning[ _-]*sage'`;
export function eligibleRangeTenant(a) {
  return !!a && isTenantOrganizationType(a.organization_type) && !/demo|burning[ _-]*sage/i.test(`${a.name || ''} ${a.slug || ''}`);
}
export function rangeUrl(value) {
  const s = String(value || '').trim();
  if (/[\\\s\u0000-\u001f]/.test(s)) return '';
  if (/^\/(?!\/)/.test(s)) return s;
  try { const u = new URL(s); return u.protocol === 'https:' && !u.username && !u.password ? s : ''; } catch { return ''; }
}
export function stringList(value) {
  try { const list = typeof value === 'string' ? JSON.parse(value) : value; return Array.isArray(list) ? list.filter(x => typeof x === 'string').slice(0, 60) : []; } catch { return []; }
}
export function partnerDto(row, logo = '') {
  return { id: Number(row.id), name: row.name, slug: row.slug, logoUrl: rangeUrl(row.logo_url) || logo,
    description: row.description || '', audience: row.audience || '', focus: row.focus || '',
    websiteUrl: rangeUrl(row.website_url), contactUrl: rangeUrl(row.contact_url),
    services: stringList(row.services), location: [row.city, row.state].filter(Boolean).join(', ') };
}
export function providerDto(row, facets = {}, photo = '') {
  row=scopeProviderRow(row,row.agency_id,row.public_details_json);
  const policy=agencyAvailability(row.public_details_json,row.agency_id);
  let details=row.public_details_json||{};if(typeof details==='string'){try{details=JSON.parse(details);}catch{details={};}}
  const accepting = policy ? policy.seesClients&&policy.acceptingNewClients : row.accepting_new_clients_override ?? (row.service_type === 'tutoring' ? row.accepting_new_students : row.provider_accepting_new_clients);
  return { id: Number(row.id), agencyId: Number(row.agency_id), agencySlug: row.agency_slug, agencyName: row.agency_name, agencyLogoUrl:rangeUrl(row.agency_logo_url),
    service: row.service_type, name: `${row.first_name || ''} ${row.last_name || ''}`.trim(), title: row.title || '', credential:row.credential||'', photoUrl: photo,
    bio: row.service_type === 'tutoring' ? row.tutoring_bio || row.public_blurb || '' : row.public_blurb || '',
    accepting: accepting == null ? null : !!Number(accepting), waitlistEnabled:policy?policy.waitlistEnabled:details.waitlistEnabled===true,
    gender:details.gender||'',languages:stringList(details.languages),populations:facets.populations||[],
    inPerson:policy?policy.inPerson:details.inPersonEnabled!==false,virtual:policy?policy.virtual:details.virtualEnabled===true||Boolean(row.has_virtual_openings)||(details.sessionFormats||[]).some(v=>/virtual|telehealth|online/i.test(v)),school:policy?.school!==false,
    onlineScheduling:!!row.online_enrolled&&!!row.public_availability_enabled, specialties: facets.specialties || [], modalities: facets.modalities || [],
    ages: row.service_type === 'tutoring' ? stringList(row.grade_levels_json) : facets.ageGroups || [],
    subjects: stringList(row.subject_areas_json), insurances: row.service_type === 'counseling' ? stringList(row.insurances_json) : [],
    location: [row.city, row.state].filter(Boolean).join(', '),
    bookingUrl: `/${encodeURIComponent(row.agency_slug)}/book/${Number(row.id)}?serviceType=${row.service_type}` };
}
export function rangeProviderEligible(row) {
 const scoped=scopeProviderRow(row,row.agency_id,row.public_details_json);
 const counselingEligible=['provider','provider_plus','intern','intern_plus','supervisor','facilitator','admin','super_admin'].includes(row.agency_role||row.role)||Boolean(row.has_provider_access)||Boolean(row.has_school_assignment);
 return ![false,0,'0'].includes(scoped.sees_clients) && offersProviderService(row.public_details_json,row.agency_id,row.service_type,{enrolled:Boolean(row.online_enrolled),hasEnrollment:Boolean(row.has_enrollment),counselingEligible});
}
export const RANGE_PROVIDER_SQL = `SELECT DISTINCT u.id,u.first_name,u.last_name,COALESCE(NULLIF(ua.agency_position,''),u.title) AS title,u.credential,u.role,u.has_provider_access,u.sees_clients,u.profile_photo_path,
 u.provider_accepting_new_clients,u.in_office_available,ua.agency_role,a.id AS agency_id,s.service_type,a.slug AS agency_slug,a.name AS agency_name,a.logo_url AS agency_logo_url,a.logo_path AS agency_logo_path,a.city,a.state,a.public_availability_enabled,
 (EXISTS(SELECT 1 FROM provider_virtual_working_hours v WHERE v.provider_id=u.id AND v.agency_id=a.id AND v.available_for_intake=1)
 OR EXISTS(SELECT 1 FROM provider_virtual_slot_availability v WHERE v.provider_id=u.id AND v.agency_id=a.id AND v.is_active=1 AND v.available_for_intake=1 AND v.end_at>UTC_TIMESTAMP())) AS has_virtual_openings,
 ${publicSchoolAssignmentSql('a.id')} AS has_school_assignment,
 COALESCE(e.is_active,0) AS online_enrolled,e.id IS NOT NULL AS has_enrollment,
 COALESCE(NULLIF(p.public_blurb,''),u.provider_school_info_blurb) AS public_blurb,p.insurances_json,p.accepting_new_clients_override,p.public_details_json,
 t.bio AS tutoring_bio,t.subject_areas_json,t.grade_levels_json,t.accepting_new_students
 FROM mental_range_memberships m JOIN agencies a ON a.id=m.agency_id
 JOIN user_agencies ua ON ua.agency_id=a.id AND COALESCE(ua.is_active,1)=1
 JOIN users u ON u.id=ua.user_id
 JOIN (
   SELECT agency_id,service_type FROM agency_public_service_types WHERE is_enabled=1
   UNION SELECT agency_id,'counseling' FROM mental_range_memberships WHERE JSON_CONTAINS(services,JSON_QUOTE('counseling'))
   UNION SELECT agency_id,'tutoring' FROM mental_range_memberships WHERE JSON_CONTAINS(services,JSON_QUOTE('tutoring'))
   UNION SELECT agency_id,'coaching' FROM mental_range_memberships WHERE JSON_CONTAINS(services,JSON_QUOTE('coaching'))
   -- The published ITSCO clinical directory is independent of online booking configuration.
   UNION SELECT id,'counseling' FROM agencies WHERE LOWER(slug)='itsco'
     AND EXISTS(SELECT 1 FROM public_marketing_pages WHERE slug='itsco' AND is_active=1)
 ) s ON s.agency_id=a.id
 LEFT JOIN provider_public_service_enrollments e ON e.agency_id=a.id AND e.user_id=u.id AND e.service_type=s.service_type
 LEFT JOIN provider_public_profiles p ON p.user_id=u.id
 LEFT JOIN provider_tutoring_profiles t ON t.user_id=u.id AND t.agency_id=a.id
 WHERE m.included=1 AND a.is_active=1 AND COALESCE(a.is_archived,0)=0
 AND ${RANGE_TENANT_SQL} AND s.service_type IN ('counseling','tutoring','coaching')
 AND COALESCE(u.is_active,1)=1 AND COALESCE(u.is_archived,0)=0 AND COALESCE(u.is_demo,0)=0
 AND UPPER(COALESCE(u.status,'')) IN ('ACTIVE','ACTIVE_EMPLOYEE')
 AND LOWER(TRIM(CONCAT(COALESCE(u.first_name,''),' ',COALESCE(u.last_name,'')))) NOT IN ('super admin','superadmin')`;
