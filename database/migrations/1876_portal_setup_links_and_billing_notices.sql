CREATE TABLE IF NOT EXISTS clinical_portal_setup_email_links (
  token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  client_id INT NOT NULL,
  agency_id INT NOT NULL,
  account_id INT NULL,
  recipient_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  expires_at DATETIME NOT NULL,
  failed_attempts SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  last_failed_at DATETIME NULL,
  used_at DATETIME NULL,
  INDEX idx_clinical_portal_setup_client_attempt (client_id, last_failed_at),
  INDEX idx_clinical_portal_setup_expiration (expires_at)
);

ALTER TABLE client_payment_setup_requests
  ADD COLUMN notice_kind ENUM('payment_setup','insurance_delay','payment_delay') NOT NULL DEFAULT 'payment_setup';
