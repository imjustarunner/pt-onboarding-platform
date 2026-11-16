-- Explicit billing recipient selection does not create consent to charge a card.
CREATE TABLE IF NOT EXISTS client_billing_responsibility_profiles (
  agency_id INT NOT NULL,
  client_id INT NOT NULL,
  party_kind ENUM('account','other') NOT NULL,
  responsible_user_id INT NULL,
  contact_encrypted LONGTEXT NULL,
  revision INT NOT NULL DEFAULT 1,
  updated_by_user_id INT NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (agency_id,client_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS client_patient_service_rates (
  agency_id INT NOT NULL,
  client_id INT NOT NULL,
  service_code VARCHAR(32) NOT NULL,
  amount_cents INT UNSIGNED NOT NULL,
  price_basis ENUM('visit','unit') NOT NULL DEFAULT 'visit',
  revision INT NOT NULL DEFAULT 1,
  updated_by_user_id INT NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (agency_id,client_id,service_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS client_billing_account_events (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  client_id INT NOT NULL,
  actor_user_id INT NOT NULL,
  action VARCHAR(80) NOT NULL,
  evidence_encrypted LONGTEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX client_billing_events (agency_id,client_id,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
