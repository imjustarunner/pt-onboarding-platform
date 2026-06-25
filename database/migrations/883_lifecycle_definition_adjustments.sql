-- Migration 883: Lifecycle checklist definition adjustments
-- 1. Add pre-hire compliance document items
-- 2. Remove offer_letter_signed (tracked via hiring pipeline, not lifecycle tab)

-- ── Remove offer letter signed ──
DELETE FROM lifecycle_checklist_definitions
WHERE item_key = 'offer_letter_signed' AND agency_id IS NULL;

-- Also clean up any user scoped items referencing it
DELETE FROM user_lifecycle_scoped_items WHERE item_key = 'offer_letter_signed';
DELETE FROM user_lifecycle_checklist_items
WHERE definition_id NOT IN (SELECT id FROM lifecycle_checklist_definitions);

-- ── Add three new compliance document items ──
INSERT INTO lifecycle_checklist_definitions
  (item_key, item_label, phase, category, order_index, applies_to, integration_type, integration_ref)
VALUES
  ('job_description_acknowledgement', 'Job Description Acknowledgement', 'onboarding', 'compliance_documents',  5, 'all', 'document_task', 'job_description'),
  ('background_check_authorization',  'Background Check Authorization',  'onboarding', 'compliance_documents', 15, 'all', 'document_task', 'background_check_authorization'),
  ('pre_employment_information',       'Pre-Employment Information',      'onboarding', 'compliance_documents', 18, 'all', 'document_task', 'pre_employment')
ON DUPLICATE KEY UPDATE
  item_label = VALUES(item_label),
  order_index = VALUES(order_index),
  integration_ref = VALUES(integration_ref);
