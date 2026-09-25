-- Prices are explicit; a missing row is not a zero price or a self-pay election.
CREATE TABLE IF NOT EXISTS agency_patient_service_rates (
  agency_id INT NOT NULL,
  service_code VARCHAR(32) NOT NULL,
  amount_cents INT UNSIGNED NULL,
  price_basis ENUM('visit','unit') NOT NULL DEFAULT 'visit',
  revision INT NOT NULL DEFAULT 1,
  updated_by_user_id INT NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (agency_id,service_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS agency_patient_service_rate_history (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  service_code VARCHAR(32) NOT NULL,
  revision INT NOT NULL,
  amount_cents INT UNSIGNED NULL,
  price_basis VARCHAR(12) NOT NULL,
  reason VARCHAR(2000) NOT NULL,
  actor_user_id INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY (agency_id,service_code,revision)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
