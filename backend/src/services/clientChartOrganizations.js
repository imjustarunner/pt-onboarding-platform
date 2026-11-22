const organizationTypes = { school:'school', clinical:'clinical', learning:'learning', life_coach:'coaching', consultant:'consulting' };
export function organizationChartType(kind) {
  return Object.hasOwn(organizationTypes, kind) ? organizationTypes[kind] : null;
}

// Both chart and caseload read the same active organization assignments. The
// tenant column is chosen by the query, never taken from request input.
export function activeChartOrganizationJoin(tenantColumn) {
  return `LEFT JOIN agencies o ON o.is_active=1 AND COALESCE(o.is_archived,0)=0
    AND (o.id=c.organization_id AND NOT EXISTS (
      SELECT 1 FROM client_organization_assignments old WHERE old.client_id=c.id AND old.organization_id=o.id AND old.is_active=0)
      OR EXISTS (SELECT 1 FROM client_organization_assignments ca WHERE ca.client_id=c.id AND ca.organization_id=o.id AND ca.is_active=1))
    AND (o.id=${tenantColumn} OR (c.agency_id=${tenantColumn} AND c.organization_id=o.id)
      OR EXISTS (SELECT 1 FROM organization_affiliations oa WHERE oa.organization_id=o.id AND oa.agency_id=${tenantColumn} AND oa.is_active=1)
      OR EXISTS (SELECT 1 FROM agency_schools s WHERE s.school_organization_id=o.id AND s.agency_id=${tenantColumn} AND s.is_active=1))`;
}

// Once a real school assignment has ended, the legacy field must not restore it.
export const endedSchoolAssignment = `EXISTS (
  SELECT 1 FROM client_organization_assignments old_school
  JOIN agencies school ON school.id=old_school.organization_id AND school.organization_type='school'
  WHERE old_school.client_id=c.id AND old_school.is_active=0
    AND (school.id=c.organization_id OR EXISTS (SELECT 1 FROM organization_affiliations oa
      WHERE oa.organization_id=school.id AND oa.agency_id=c.agency_id)
      OR EXISTS (SELECT 1 FROM agency_schools s WHERE s.school_organization_id=school.id AND s.agency_id=c.agency_id))
)`;
