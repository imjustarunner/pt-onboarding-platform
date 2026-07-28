-- Migration 1089: Federal Background/Fingerprint Check lifecycle + tenant expiration years
-- 1) Rename Background Check Complete → Federal Background/Fingerprint Check
-- 2) Remove Fingerprints Complete
-- 3) Add Internal Background Check Complete
-- 4) Store per-item expiration dates on lifecycle checklist rows
-- 5) Tenant setting: agencies.federal_background_check_expiration_years (3 or 5, default 5)

UPDATE lifecycle_checklist_definitions
SET item_label = 'Federal Background/Fingerprint Check'
WHERE item_key = 'background_check_complete'
  AND agency_id IS NULL;

DELETE FROM user_lifecycle_scoped_items
WHERE item_key = 'fingerprints_complete';

DELETE FROM lifecycle_checklist_definitions
WHERE item_key = 'fingerprints_complete'
  AND agency_id IS NULL;

DELETE FROM user_lifecycle_checklist_items
WHERE definition_id NOT IN (SELECT id FROM lifecycle_checklist_definitions);

INSERT INTO lifecycle_checklist_definitions
  (item_key, item_label, phase, category, order_index, applies_to, integration_type, integration_ref, is_required, is_platform_template, agency_id, scope_mode)
VALUES
  ('internal_background_check_complete', 'Internal Background Check Complete', 'onboarding', 'background_credentialing', 25, 'all', 'manual', NULL, 0, 1, NULL, 'always')
ON DUPLICATE KEY UPDATE
  item_label = VALUES(item_label),
  order_index = VALUES(order_index),
  applies_to = VALUES(applies_to),
  integration_type = VALUES(integration_type),
  is_required = VALUES(is_required),
  scope_mode = VALUES(scope_mode);

-- Keep federal check above internal, then CAQH / medicaid / credentialing
UPDATE lifecycle_checklist_definitions
SET order_index = 20
WHERE item_key = 'background_check_complete' AND agency_id IS NULL;

UPDATE lifecycle_checklist_definitions
SET order_index = 25
WHERE item_key = 'internal_background_check_complete' AND agency_id IS NULL;

UPDATE lifecycle_checklist_definitions
SET order_index = 30
WHERE item_key = 'caqh_complete' AND agency_id IS NULL;

ALTER TABLE user_lifecycle_checklist_items
  ADD COLUMN expires_at DATE NULL
  COMMENT 'Expiration date for credential-style checklist items (e.g. federal background/fingerprint check)';

ALTER TABLE agencies
  ADD COLUMN federal_background_check_expiration_years TINYINT NOT NULL DEFAULT 5
  COMMENT 'Years until Federal Background/Fingerprint Check expires (3 or 5)';
