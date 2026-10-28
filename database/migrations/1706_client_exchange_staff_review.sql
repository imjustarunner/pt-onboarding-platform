-- Staff decisions are scoped to one referral, provider and matching parameter.
CREATE TABLE IF NOT EXISTS client_exchange_match_waivers (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  listing_id BIGINT UNSIGNED NOT NULL,
  provider_user_id INT NOT NULL,
  field VARCHAR(64) NOT NULL,
  fingerprint CHAR(64) NOT NULL,
  original_status VARCHAR(16) NOT NULL,
  original_reason TEXT NOT NULL,
  reason VARCHAR(1000) NOT NULL,
  waived_by_user_id INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_by_user_id INT NULL,
  revoked_at DATETIME NULL,
  KEY idx_exchange_waiver_provider (listing_id, provider_user_id, revoked_at),
  CONSTRAINT fk_exchange_waiver_listing FOREIGN KEY (listing_id) REFERENCES client_exchange_listings(id) ON DELETE CASCADE,
  CONSTRAINT fk_exchange_waiver_provider FOREIGN KEY (provider_user_id) REFERENCES users(id),
  CONSTRAINT fk_exchange_waiver_actor FOREIGN KEY (waived_by_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS client_exchange_shares (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  listing_id BIGINT UNSIGNED NOT NULL,
  provider_user_id INT NOT NULL,
  shared_by_user_id INT NOT NULL,
  request_key VARCHAR(64) NOT NULL,
  share_number INT NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'sending',
  delivery_json JSON NULL,
  notification_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_exchange_share_attempt (listing_id, shared_by_user_id, request_key),
  KEY idx_exchange_share_provider (listing_id, provider_user_id),
  CONSTRAINT fk_exchange_share_listing FOREIGN KEY (listing_id) REFERENCES client_exchange_listings(id) ON DELETE CASCADE,
  CONSTRAINT fk_exchange_share_provider FOREIGN KEY (provider_user_id) REFERENCES users(id),
  CONSTRAINT fk_exchange_share_actor FOREIGN KEY (shared_by_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE client_exchange_requests ADD COLUMN acknowledged_warnings_json JSON NULL;
