ALTER TABLE client_referral_ocr_requests
  ADD COLUMN expires_at TIMESTAMP NULL AFTER updated_at,
  ADD INDEX idx_referral_ocr_expires_at (expires_at);
