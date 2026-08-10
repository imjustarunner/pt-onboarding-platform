-- Migration 1165: Seed onboarded client status for staff-complete → provider-final pipeline.
INSERT INTO client_statuses (agency_id, status_key, label, description, is_active)
SELECT a.id,
       'onboarded',
       'Onboarded',
       'Staff onboarding complete. Awaiting provider contact, intake, and first service before Current.',
       TRUE
FROM agencies a
WHERE (a.organization_type = 'agency' OR a.organization_type IS NULL)
ON DUPLICATE KEY UPDATE
  label = VALUES(label),
  description = VALUES(description),
  is_active = TRUE;
