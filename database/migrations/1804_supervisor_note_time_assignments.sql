-- Standard manual Supervision Note Time is assigned to active supervisors in
-- ITSCO and Next Level Up. Re-running preserves personal rate overrides and
-- leaves every other activity, claim, and payroll result unchanged.
INSERT INTO payroll_user_indirect_service_assignments (agency_id, user_id, service_type_id, is_enabled)
SELECT DISTINCT t.agency_id, u.id, t.id, 1
FROM payroll_indirect_service_types t
JOIN user_agencies ua ON ua.agency_id = t.agency_id
JOIN users u ON u.id = ua.user_id
WHERE t.agency_id IN (2, 6)
  AND t.type_key = 'supervision_note_time' AND t.pay_bucket = 'supervision_note' AND t.is_active = 1
  AND (u.has_supervisor_privileges = 1 OR LOWER(u.role) = 'supervisor')
  AND u.status = 'ACTIVE_EMPLOYEE' AND COALESCE(u.is_active, 1) = 1 AND COALESCE(u.is_archived, 0) = 0
  AND COALESCE(ua.is_active, 1) = 1
ON DUPLICATE KEY UPDATE is_enabled = 1;
