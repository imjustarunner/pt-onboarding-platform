-- Narrow the standard note-signing duty to clinical supervisors, per agency.
-- Preserve existing claims, historical pay, personal rates, and all other duties.
UPDATE payroll_user_indirect_service_assignments a
JOIN payroll_indirect_service_types t ON t.id = a.service_type_id AND t.agency_id = a.agency_id
SET a.is_enabled = 0
WHERE a.agency_id IN (2, 6) AND t.type_key = 'supervision_note_time' AND t.pay_bucket = 'supervision_note'
  AND NOT EXISTS (SELECT 1 FROM supervisor_assignments sa
    WHERE sa.supervisor_id = a.user_id AND sa.agency_id = a.agency_id AND sa.supervisor_type = 'clinical');

INSERT INTO payroll_user_indirect_service_assignments (agency_id, user_id, service_type_id, is_enabled)
SELECT DISTINCT t.agency_id, u.id, t.id, 1
FROM payroll_indirect_service_types t
JOIN user_agencies ua ON ua.agency_id = t.agency_id
JOIN users u ON u.id = ua.user_id
WHERE t.agency_id IN (2, 6)
  AND t.type_key = 'supervision_note_time' AND t.pay_bucket = 'supervision_note' AND t.is_active = 1
  AND EXISTS (SELECT 1 FROM supervisor_assignments sa WHERE sa.supervisor_id = u.id AND sa.agency_id = t.agency_id AND sa.supervisor_type = 'clinical')
  AND u.status = 'ACTIVE_EMPLOYEE' AND COALESCE(u.is_active, 1) = 1 AND COALESCE(u.is_archived, 0) = 0
  AND COALESCE(ua.is_active, 1) = 1
ON DUPLICATE KEY UPDATE is_enabled = 1;
