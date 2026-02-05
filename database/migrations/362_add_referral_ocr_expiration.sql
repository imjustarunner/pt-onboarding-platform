ALTER TABLE client_referral_ocr_requests
  ADD COLUMN expires_at TIMESTAMP NULL AFTER updated_at,
  ADD COLUMN is_encrypted BOOLEAN NOT NULL DEFAULT TRUE AFTER expires_at,
  ADD COLUMN result_text_encrypted LONGBLOB NULL AFTER is_encrypted,
  ADD COLUMN encryption_key_id VARCHAR(255) NULL AFTER result_text_encrypted,
  ADD COLUMN encryption_wrapped_key TEXT NULL AFTER encryption_key_id,
  ADD COLUMN encryption_iv TEXT NULL AFTER encryption_wrapped_key,
  ADD COLUMN encryption_auth_tag TEXT NULL AFTER encryption_iv,
  ADD COLUMN encryption_alg VARCHAR(64) NULL AFTER encryption_auth_tag,
  ADD COLUMN encryption_aad TEXT NULL AFTER encryption_alg,
  ADD INDEX idx_referral_ocr_expires_at (expires_at);
