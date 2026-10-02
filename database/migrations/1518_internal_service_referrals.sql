-- Separate transfer referrals from additional services without replacing the primary therapist.
ALTER TABLE client_exchange_listings
  ADD COLUMN referral_kind ENUM('transfer','additional_service') NOT NULL DEFAULT 'transfer';
ALTER TABLE client_exchange_listings
  ADD COLUMN service_type VARCHAR(80) NOT NULL DEFAULT 'individual';
ALTER TABLE client_exchange_listings
  ADD COLUMN target_provider_user_id INT NULL;
ALTER TABLE client_exchange_listings
  ADD CONSTRAINT fk_exchange_target_provider FOREIGN KEY (target_provider_user_id) REFERENCES users(id) ON DELETE RESTRICT;
CREATE TABLE IF NOT EXISTS client_service_assignments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  client_id INT NOT NULL,
  agency_id INT NOT NULL,
  provider_user_id INT NOT NULL,
  service_type VARCHAR(80) NOT NULL,
  referral_listing_id BIGINT UNSIGNED NOT NULL,
  created_by_user_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_client_service_provider (client_id,service_type,provider_user_id),
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  FOREIGN KEY (agency_id) REFERENCES agencies(id),
  FOREIGN KEY (provider_user_id) REFERENCES users(id),
  FOREIGN KEY (referral_listing_id) REFERENCES client_exchange_listings(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Generate only from status. client_id has ON DELETE SET NULL and therefore
-- cannot be a base column of a stored generated expression in MySQL.
-- Closed referrals get NULL, so multiple historical referrals remain allowed.
-- Keep column/index additions separate so a partial run can be retried safely.
ALTER TABLE client_exchange_listings
  ADD COLUMN active_referral_slot TINYINT GENERATED ALWAYS AS
    (CASE WHEN status IN ('open','requested') THEN 1 ELSE NULL END) STORED;
ALTER TABLE client_exchange_listings
  ADD UNIQUE KEY uq_active_service_referral (client_id,referral_kind,service_type,active_referral_slot);
