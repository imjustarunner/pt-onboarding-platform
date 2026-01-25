-- Migration: Agency credentialing grid field keys
-- Purpose:
--   Ensure a stable set of credentialing-related user info fields exist (platform templates)
--   so admins/support/staff can manage provider credentialing data in an agency-wide grid.
--
-- Notes:
--   - user_info_* tables use UNIQUE(agency_id, key) but allow duplicates when agency_id IS NULL
--     (because NULL != NULL). So we use NOT EXISTS guards for idempotency.

-- 1) Ensure a platform category exists for grouping
INSERT INTO user_info_categories (category_key, category_label, is_platform_template, agency_id, order_index, created_by_user_id)
SELECT 'credentialing', 'Credentialing', TRUE, NULL, 0, NULL
WHERE NOT EXISTS (
  SELECT 1 FROM user_info_categories WHERE category_key = 'credentialing' AND agency_id IS NULL LIMIT 1
);

-- 2) Ensure field definitions exist (platform templates)
-- Helper pattern: INSERT ... SELECT ... WHERE NOT EXISTS ...

-- date_of_birth
INSERT INTO user_info_field_definitions
  (field_key, field_label, field_type, options, is_required, is_platform_template, agency_id, parent_field_id, category_key, order_index, created_by_user_id)
SELECT 'date_of_birth', 'Date of Birth', 'date', NULL, FALSE, TRUE, NULL, NULL, 'credentialing', 10, NULL
WHERE NOT EXISTS (
  SELECT 1 FROM user_info_field_definitions WHERE field_key = 'date_of_birth' AND agency_id IS NULL LIMIT 1
);

-- first_client_date
INSERT INTO user_info_field_definitions
  (field_key, field_label, field_type, options, is_required, is_platform_template, agency_id, parent_field_id, category_key, order_index, created_by_user_id)
SELECT 'first_client_date', 'First Client Date', 'date', NULL, FALSE, TRUE, NULL, NULL, 'credentialing', 20, NULL
WHERE NOT EXISTS (
  SELECT 1 FROM user_info_field_definitions WHERE field_key = 'first_client_date' AND agency_id IS NULL LIMIT 1
);

-- zipcode
INSERT INTO user_info_field_definitions
  (field_key, field_label, field_type, options, is_required, is_platform_template, agency_id, parent_field_id, category_key, order_index, created_by_user_id)
SELECT 'zipcode', 'Zip Code', 'text', NULL, FALSE, TRUE, NULL, NULL, 'credentialing', 30, NULL
WHERE NOT EXISTS (
  SELECT 1 FROM user_info_field_definitions WHERE field_key = 'zipcode' AND agency_id IS NULL LIMIT 1
);

-- npi_id (separate from NPI number, for agency credentialing workflows)
INSERT INTO user_info_field_definitions
  (field_key, field_label, field_type, options, is_required, is_platform_template, agency_id, parent_field_id, category_key, order_index, created_by_user_id)
SELECT 'npi_id', 'NPI ID', 'text', NULL, FALSE, TRUE, NULL, NULL, 'credentialing', 40, NULL
WHERE NOT EXISTS (
  SELECT 1 FROM user_info_field_definitions WHERE field_key = 'npi_id' AND agency_id IS NULL LIMIT 1
);

-- provider_identity_taxonomy_code
INSERT INTO user_info_field_definitions
  (field_key, field_label, field_type, options, is_required, is_platform_template, agency_id, parent_field_id, category_key, order_index, created_by_user_id)
SELECT 'provider_identity_taxonomy_code', 'Taxonomy Code', 'text', NULL, FALSE, TRUE, NULL, NULL, 'credentialing', 50, NULL
WHERE NOT EXISTS (
  SELECT 1 FROM user_info_field_definitions WHERE field_key = 'provider_identity_taxonomy_code' AND agency_id IS NULL LIMIT 1
);

-- medicaid_provider_type
INSERT INTO user_info_field_definitions
  (field_key, field_label, field_type, options, is_required, is_platform_template, agency_id, parent_field_id, category_key, order_index, created_by_user_id)
SELECT 'medicaid_provider_type', 'Medicaid Provider Type', 'text', NULL, FALSE, TRUE, NULL, NULL, 'credentialing', 60, NULL
WHERE NOT EXISTS (
  SELECT 1 FROM user_info_field_definitions WHERE field_key = 'medicaid_provider_type' AND agency_id IS NULL LIMIT 1
);

-- tax_id
INSERT INTO user_info_field_definitions
  (field_key, field_label, field_type, options, is_required, is_platform_template, agency_id, parent_field_id, category_key, order_index, created_by_user_id)
SELECT 'tax_id', 'Tax ID', 'text', NULL, FALSE, TRUE, NULL, NULL, 'credentialing', 70, NULL
WHERE NOT EXISTS (
  SELECT 1 FROM user_info_field_definitions WHERE field_key = 'tax_id' AND agency_id IS NULL LIMIT 1
);

-- medicaid_effective_date
INSERT INTO user_info_field_definitions
  (field_key, field_label, field_type, options, is_required, is_platform_template, agency_id, parent_field_id, category_key, order_index, created_by_user_id)
SELECT 'medicaid_effective_date', 'Medicaid Effective Date', 'date', NULL, FALSE, TRUE, NULL, NULL, 'credentialing', 80, NULL
WHERE NOT EXISTS (
  SELECT 1 FROM user_info_field_definitions WHERE field_key = 'medicaid_effective_date' AND agency_id IS NULL LIMIT 1
);

-- medicare_number
INSERT INTO user_info_field_definitions
  (field_key, field_label, field_type, options, is_required, is_platform_template, agency_id, parent_field_id, category_key, order_index, created_by_user_id)
SELECT 'medicare_number', 'Medicare Number', 'text', NULL, FALSE, TRUE, NULL, NULL, 'credentialing', 90, NULL
WHERE NOT EXISTS (
  SELECT 1 FROM user_info_field_definitions WHERE field_key = 'medicare_number' AND agency_id IS NULL LIMIT 1
);

-- 3) Best-effort: ensure these keys are grouped under the credentialing category
UPDATE user_info_field_definitions
SET category_key = 'credentialing'
WHERE field_key IN (
  'date_of_birth',
  'first_client_date',
  'zipcode',
  'npi_id',
  'provider_identity_taxonomy_code',
  'medicaid_provider_type',
  'tax_id',
  'medicaid_effective_date',
  'medicare_number',
  'provider_identity_npi_number',
  'provider_credential_license_type_number',
  'provider_credential_license_issued_date',
  'provider_credential_license_expiration_date',
  'provider_credential_medicaid_location_id',
  'provider_credential_medicaid_revalidation_date',
  'provider_credential_caqh_provider_id'
)
AND (category_key IS NULL OR category_key = '');

