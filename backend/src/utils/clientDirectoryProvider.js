// The directory reads service assignments without rewriting the legacy chart
// owner, which is still used by older scheduling and permission paths.
export function clientDirectoryProviderJoin(agencyId = null) {
  const id = Number(agencyId);
  const agency = Number.isSafeInteger(id) && id > 0 ? String(id) : 'c.agency_id';
  return `LEFT JOIN client_service_enrollments directory_service ON directory_service.id=(
    SELECT enrollment.id FROM client_service_enrollments enrollment
    WHERE enrollment.client_id=c.id AND enrollment.agency_id=${agency} AND enrollment.is_active=1
    ORDER BY (enrollment.provider_user_id>0) DESC,(enrollment.service_kind='counseling') DESC,
      (enrollment.organization_id>0) DESC,enrollment.id ASC LIMIT 1
  )
  LEFT JOIN users provider ON provider.id=CASE
    WHEN directory_service.id IS NOT NULL THEN NULLIF(directory_service.provider_user_id,0)
    WHEN EXISTS (SELECT 1 FROM client_service_enrollments enrollment_history
      WHERE enrollment_history.client_id=c.id AND enrollment_history.agency_id=${agency}) THEN NULL
    WHEN c.agency_id=${agency} THEN c.provider_id ELSE NULL END`;
}

export function formatClientDirectoryProvider(row) {
  const result = { ...row, provider_name: [row.provider_first_name, row.provider_last_name].filter(Boolean).join(' ').trim() || null };
  delete result.billing_insurance_payload;
  if (Number(row.assigned_service_id) > 0) {
    // Client-level history describes the old owner, not this service assignment.
    result.assigned_at = null;
    result.provider_assigned_at = null;
    result.assigned_by_name = null;
    result.provider_assigned_by_name = null;
  }
  return result;
}
