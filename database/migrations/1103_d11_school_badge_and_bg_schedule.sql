-- Migration 1103: D11 school badge lifecycle item + BG scheduled_at + scoped source
-- 1) scheduled_at on lifecycle checklist rows (expired federal BG rebooking)
-- 2) Optional School Badge attestation (District 11; does not count toward %)
-- 3) Allow school_assignment as a scoped-item source

ALTER TABLE user_lifecycle_checklist_items
  ADD COLUMN scheduled_at DATE NULL
  COMMENT 'Date federal BG recheck is scheduled (used when expired)';

ALTER TABLE user_lifecycle_scoped_items
  MODIFY COLUMN source ENUM(
    'document_task',
    'training_task',
    'package',
    'manual',
    'offboarding',
    'backfill',
    'school_assignment'
  ) NOT NULL DEFAULT 'package';

INSERT INTO lifecycle_checklist_definitions
  (item_key, item_label, phase, category, order_index, applies_to, integration_type, integration_ref, is_required, is_platform_template, agency_id, scope_mode)
VALUES
  ('school_badge', 'School Badge', 'onboarding', 'background_credentialing', 28, 'provider', 'manual', NULL, 0, 1, NULL, 'assigned')
ON DUPLICATE KEY UPDATE
  item_label = VALUES(item_label),
  category = VALUES(category),
  order_index = VALUES(order_index),
  applies_to = VALUES(applies_to),
  integration_type = VALUES(integration_type),
  is_required = 0,
  scope_mode = 'assigned';
