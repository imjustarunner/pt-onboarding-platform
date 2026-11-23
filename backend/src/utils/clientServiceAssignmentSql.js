/** Use the same active, agency-scoped service assignment in caseload and access checks. */
export function clientServiceAssignmentSql({ providerId, agencyId = null, agencyIds = null, serviceKind = null, clientAlias = 'c', sameClientAgency = false }) {
  const c = clientAlias;
  const scopes = agencyId ? [agencyId] : agencyIds || [];
  return {
    sql: `EXISTS (SELECT 1 FROM client_service_enrollments assigned_service
      JOIN user_agencies assigned_membership ON assigned_membership.user_id=assigned_service.provider_user_id
        AND assigned_membership.agency_id=assigned_service.agency_id AND COALESCE(assigned_membership.is_active,1)=1
      WHERE assigned_service.client_id=${c}.id AND assigned_service.provider_user_id=?
        AND assigned_service.is_active=1 AND COALESCE(assigned_service.service_status,'active')='active'
        ${agencyId ? 'AND assigned_service.agency_id=?' : scopes.length ? `AND assigned_service.agency_id IN (${scopes.map(() => '?').join(',')})` : ''}
        ${sameClientAgency ? `AND assigned_service.agency_id=${c}.agency_id` : ''}
        ${serviceKind ? 'AND assigned_service.service_kind=?' : ''}
        AND (${c}.agency_id=assigned_service.agency_id OR EXISTS
          (SELECT 1 FROM client_agency_assignments assigned_client_agency WHERE assigned_client_agency.client_id=${c}.id
            AND assigned_client_agency.agency_id=assigned_service.agency_id AND assigned_client_agency.is_active=1)))`,
    params: [providerId, ...scopes, ...(serviceKind ? [serviceKind] : [])]
  };
}
