-- Migration: Add column-level encryption for intake_submissions payload + signer PII.
--
-- Intake responses (intake_data JSON) and the four signer fields
-- (signer_name, signer_initials, signer_email, signer_phone) contain PHI/PII
-- that must be protected at rest. We store an AES-256-GCM ciphertext blob
-- ("payload_encrypted") that, on decrypt, yields a JSON object of the form:
--   { intakeData, signerName, signerInitials, signerEmail, signerPhone }
--
-- When INTAKE_RESPONSES_ENCRYPTION_KEY_BASE64 (or GUARDIAN_INTAKE_ENCRYPTION_KEY_BASE64)
-- is configured, IntakeSubmission.create / updateById encrypts on write and
-- nulls out the plaintext columns. Readers (model + the few raw-SQL controllers
-- that touch these columns directly) transparently decrypt.
--
-- The plaintext columns stay in place so we can:
--   1. Backfill existing rows with backfillEncryptIntakeSubmissions.js.
--   2. Roll back if anything goes wrong.
-- A follow-up migration will drop the plaintext columns once the backfill has
-- run cleanly in every environment.

ALTER TABLE intake_submissions
  ADD COLUMN payload_encrypted MEDIUMBLOB NULL AFTER intake_data_hash,
  ADD COLUMN payload_iv_b64 VARCHAR(64) NULL AFTER payload_encrypted,
  ADD COLUMN payload_auth_tag_b64 VARCHAR(64) NULL AFTER payload_iv_b64,
  ADD COLUMN payload_key_id VARCHAR(50) NULL AFTER payload_auth_tag_b64;
