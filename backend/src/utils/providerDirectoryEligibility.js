// Directory participation never grants application permissions or online booking enrollment.
export const PROVIDER_DIRECTORY_ROLES = ['provider','provider_plus','intern','intern_plus','facilitator','supervisor','admin','super_admin'];
export const seesClients = person => ![false, 0, '0'].includes(person?.sees_clients ?? person?.seesClients ?? true);
export function isDirectoryProvider(person, {assigned=false, enrolled=false}={}) {
 return seesClients(person) && (assigned || enrolled || PROVIDER_DIRECTORY_ROLES.includes(String(person?.role || '').toLowerCase()) || [true,1,'1'].includes(person?.has_provider_access));
}

// SQL fragments use only static aliases supplied by server code, never request values.
export function publicSchoolAssignmentSql(agencyExpression,providerExpression='u.id') {
 return `EXISTS(SELECT 1 FROM provider_school_assignments psa JOIN agencies school ON school.id=psa.school_organization_id
 WHERE psa.provider_user_id=${providerExpression} AND psa.is_active=1 AND COALESCE(school.is_archived,0)=0
 AND (EXISTS(SELECT 1 FROM organization_affiliations f WHERE f.organization_id=school.id AND f.agency_id=${agencyExpression} AND f.is_active=1)
 OR EXISTS(SELECT 1 FROM agency_schools f WHERE f.school_organization_id=school.id AND f.agency_id=${agencyExpression} AND f.is_active=1))
 AND NOT EXISTS(SELECT 1 FROM district_schedule_hidden_schools h WHERE h.school_organization_id=school.id AND h.agency_id=${agencyExpression})
 AND NOT EXISTS(SELECT 1 FROM district_schedule_hidden_providers h WHERE h.school_organization_id=school.id AND h.agency_id=${agencyExpression} AND h.provider_user_id=${providerExpression}))`;
}
