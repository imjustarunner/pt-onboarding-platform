-- Add encryption columns for intake uploads (driver's license, etc. - treat as PHI).
-- Uses same AES-256-GCM + KMS approach as referral packets and PHI documents.
-- Requires REFERRAL_KMS_KEY or DOCUMENTS_KMS_KEY to be configured for encryption.
ALTER TABLE intake_submission_uploads
  ADD COLUMN is_encrypted TINYINT(1) NOT NULL DEFAULT 1 AFTER mime_type,
  ADD COLUMN encryption_key_id VARCHAR(255) NULL AFTER is_encrypted,
  ADD COLUMN encryption_wrapped_key TEXT NULL AFTER encryption_key_id,
  ADD COLUMN encryption_iv VARCHAR(255) NULL AFTER encryption_wrapped_key,
  ADD COLUMN encryption_auth_tag VARCHAR(255) NULL AFTER encryption_iv,
  ADD COLUMN encryption_alg VARCHAR(64) NULL AFTER encryption_auth_tag,
  ADD COLUMN encryption_aad TEXT NULL AFTER encryption_alg;
