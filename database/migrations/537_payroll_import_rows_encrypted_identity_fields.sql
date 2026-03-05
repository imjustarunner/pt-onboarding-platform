-- Migration: add encrypted identity fields for payroll import rows
-- Purpose: ensure imported provider and patient names are encrypted at rest.

ALTER TABLE payroll_import_rows
  ADD COLUMN provider_name_ciphertext_b64 TEXT NULL AFTER provider_name,
  ADD COLUMN provider_name_iv_b64 VARCHAR(64) NULL AFTER provider_name_ciphertext_b64,
  ADD COLUMN provider_name_auth_tag_b64 VARCHAR(64) NULL AFTER provider_name_iv_b64,
  ADD COLUMN provider_name_key_id VARCHAR(64) NULL AFTER provider_name_auth_tag_b64,
  ADD COLUMN patient_first_name_ciphertext_b64 TEXT NULL AFTER patient_first_name,
  ADD COLUMN patient_first_name_iv_b64 VARCHAR(64) NULL AFTER patient_first_name_ciphertext_b64,
  ADD COLUMN patient_first_name_auth_tag_b64 VARCHAR(64) NULL AFTER patient_first_name_iv_b64,
  ADD COLUMN patient_first_name_key_id VARCHAR(64) NULL AFTER patient_first_name_auth_tag_b64;
