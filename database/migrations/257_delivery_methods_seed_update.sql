-- Add document delivery method options requested for intake.
-- Non-destructive: does not remove existing keys (e.g., uploaded, school_emailed, set_home).

INSERT INTO paperwork_delivery_methods (school_organization_id, method_key, label, is_active)
SELECT s.id, 'emailed', 'Emailed', TRUE
FROM agencies s
WHERE s.organization_type = 'school'
ON DUPLICATE KEY UPDATE label = VALUES(label), is_active = TRUE;

INSERT INTO paperwork_delivery_methods (school_organization_id, method_key, label, is_active)
SELECT s.id, 'sent_home', 'Sent home', TRUE
FROM agencies s
WHERE s.organization_type = 'school'
ON DUPLICATE KEY UPDATE label = VALUES(label), is_active = TRUE;

INSERT INTO paperwork_delivery_methods (school_organization_id, method_key, label, is_active)
SELECT s.id, 'portal', 'Portal', TRUE
FROM agencies s
WHERE s.organization_type = 'school'
ON DUPLICATE KEY UPDATE label = VALUES(label), is_active = TRUE;

INSERT INTO paperwork_delivery_methods (school_organization_id, method_key, label, is_active)
SELECT s.id, 'school_email', 'School email', TRUE
FROM agencies s
WHERE s.organization_type = 'school'
ON DUPLICATE KEY UPDATE label = VALUES(label), is_active = TRUE;

INSERT INTO paperwork_delivery_methods (school_organization_id, method_key, label, is_active)
SELECT s.id, 'unknown', 'Unknown', TRUE
FROM agencies s
WHERE s.organization_type = 'school'
ON DUPLICATE KEY UPDATE label = VALUES(label), is_active = TRUE;

