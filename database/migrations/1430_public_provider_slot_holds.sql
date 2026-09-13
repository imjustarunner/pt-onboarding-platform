-- Temporary selection only: never creates an appointment or recurring assignment.
CREATE TABLE IF NOT EXISTS public_provider_slot_holds (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  provider_id INT NOT NULL,
  service_type VARCHAR(24) NOT NULL,
  modality VARCHAR(16) NOT NULL,
  start_at DATETIME(3) NOT NULL,
  end_at DATETIME(3) NOT NULL,
  token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_public_hold_token (token_hash),
  KEY idx_public_hold_provider (provider_id, expires_at, start_at, end_at)
) ENGINE=InnoDB;

ALTER TABLE provider_public_profiles ADD COLUMN public_details_json JSON NULL;
