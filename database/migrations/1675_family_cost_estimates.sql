-- Staged only: no live prices, payer contracts, balances, cards or sends change.
CREATE TABLE IF NOT EXISTS agency_cost_estimate_rates (
  agency_id INT NOT NULL,
  service_code VARCHAR(32) NOT NULL,
  description VARCHAR(255) NOT NULL,
  amount_cents BIGINT UNSIGNED NULL,
  unit_label VARCHAR(50) NOT NULL DEFAULT 'session',
  approved TINYINT(1) NOT NULL DEFAULT 0,
  revision INT UNSIGNED NOT NULL DEFAULT 1,
  reviewed_by_user_id INT NULL,
  reviewed_at DATETIME(6) NULL,
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (agency_id, service_code)
);
CREATE TABLE IF NOT EXISTS family_cost_estimates (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  agency_id INT NOT NULL,
  client_id INT NOT NULL,
  guardian_user_id INT NOT NULL,
  provider_user_id INT NOT NULL,
  request_key VARCHAR(100) NOT NULL,
  request_hash CHAR(64) NOT NULL,
  status ENUM('draft','issued','acknowledged','superseded') NOT NULL DEFAULT 'draft',
  snapshot_encrypted LONGTEXT NOT NULL,
  snapshot_hash CHAR(64) NOT NULL,
  acknowledgment_encrypted LONGTEXT NULL,
  created_by_user_id INT NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  issued_at DATETIME(6) NULL,
  acknowledged_at DATETIME(6) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_cost_estimate_request (agency_id, request_key),
  KEY ix_cost_estimate_client (agency_id, client_id, id),
  KEY ix_cost_estimate_guardian (agency_id, guardian_user_id, status)
);
CREATE TABLE IF NOT EXISTS family_cost_estimate_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  agency_id INT NOT NULL,
  estimate_id BIGINT UNSIGNED NULL,
  actor_user_id INT NOT NULL,
  event_type VARCHAR(50) NOT NULL,
  evidence_encrypted LONGTEXT NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY ix_cost_estimate_events (agency_id, estimate_id, id)
);
