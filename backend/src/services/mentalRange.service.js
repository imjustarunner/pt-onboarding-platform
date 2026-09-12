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
  const accepting = row.accepting_new_clients_override ?? (row.service_type === 'tutoring' ? row.accepting_new_students : row.provider_accepting_new_clients);
  return { id: Number(row.id), agencyId: Number(row.agency_id), agencySlug: row.agency_slug, agencyName: row.agency_name,
    service: row.service_type, name: `${row.first_name || ''} ${row.last_name || ''}`.trim(), title: row.title || '', photoUrl: photo,
    bio: row.service_type === 'tutoring' ? row.tutoring_bio || row.public_blurb || '' : row.public_blurb || '',
    accepting: accepting == null ? null : !!Number(accepting), specialties: facets.specialties || [], modalities: facets.modalities || [],
    ages: row.service_type === 'tutoring' ? stringList(row.grade_levels_json) : facets.ageGroups || [],
    subjects: stringList(row.subject_areas_json), insurances: row.service_type === 'counseling' ? stringList(row.insurances_json) : [],
    location: [row.city, row.state].filter(Boolean).join(', '),
    bookingUrl: `/${encodeURIComponent(row.agency_slug)}/book/${Number(row.id)}?serviceType=${row.service_type}` };
}
export const RANGE_PROVIDER_SQL = `SELECT DISTINCT u.id, u.first_name, u.last_name, u.title, u.profile_photo_path,
 u.provider_accepting_new_clients, e.agency_id, e.service_type, a.slug AS agency_slug, a.name AS agency_name, a.city, a.state,
 p.public_blurb, p.insurances_json, p.accepting_new_clients_override,
 t.bio AS tutoring_bio, t.subject_areas_json, t.grade_levels_json, t.accepting_new_students
 FROM mental_range_memberships m JOIN agencies a ON a.id=m.agency_id
 JOIN provider_public_service_enrollments e ON e.agency_id=a.id AND e.is_active=1
 JOIN agency_public_service_types s ON s.agency_id=a.id AND s.service_type=e.service_type AND s.is_enabled=1
 JOIN users u ON u.id=e.user_id
 JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=a.id
 LEFT JOIN provider_public_profiles p ON p.user_id=u.id
 LEFT JOIN provider_tutoring_profiles t ON t.user_id=u.id AND t.agency_id=a.id
 WHERE m.included=1 AND a.is_active=1 AND COALESCE(a.is_archived,0)=0 AND a.public_availability_enabled=1
 AND ${RANGE_TENANT_SQL}
 AND e.service_type IN ('counseling','tutoring','coaching')
 AND COALESCE(u.is_active,1)=1 AND COALESCE(u.is_archived,0)=0
 AND UPPER(COALESCE(u.status,'')) NOT IN ('ARCHIVED','PROSPECTIVE','TERMINATED')
 AND LOWER(u.role) IN ('provider','provider_plus','admin','super_admin','staff')`;
