-- Migration 916: payer credentialing documents, returned date, and provider notes field
-- Adds per-payer document paths + returned_date on user_insurance_credentialing.
-- Seeds platform user_info field for provider-level credentialing notes and state_of_birth visibility.

ALTER TABLE user_insurance_credentialing
  ADD COLUMN returned_date DATE NULL
    COMMENT 'Date the payer returned the completed credentialing packet',
  ADD COLUMN welcome_letter_path VARCHAR(512) NULL
    COMMENT 'Stored path for payer welcome letter (credentials/... or uploads/...)',
  ADD COLUMN contract_path VARCHAR(512) NULL
    COMMENT 'Stored path for payer contract (credentials/... or uploads/...)';

INSERT INTO user_info_field_definitions
  (field_key, field_label, field_type, options, is_required, is_platform_template, agency_id, parent_field_id, category_key, order_index, created_by_user_id)
SELECT 'credentialing_provider_notes', 'Credentialing Notes', 'textarea', NULL, FALSE, TRUE, NULL, NULL, 'credentialing', 0, NULL
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM user_info_field_definitions WHERE field_key = 'credentialing_provider_notes' AND agency_id IS NULL
);

INSERT INTO user_info_field_definitions
  (field_key, field_label, field_type, options, is_required, is_platform_template, agency_id, parent_field_id, category_key, order_index, created_by_user_id)
SELECT 'state_of_birth', 'State of Birth', 'text', NULL, FALSE, TRUE, NULL, NULL, 'credentialing', 1, NULL
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM user_info_field_definitions WHERE field_key = 'state_of_birth' AND agency_id IS NULL
);
