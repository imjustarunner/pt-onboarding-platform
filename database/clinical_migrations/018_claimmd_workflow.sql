ALTER TABLE clinical_claims
  ADD COLUMN claimmd_connection_id VARCHAR(120) NULL,
  ADD COLUMN billing_revision INT NOT NULL DEFAULT 0,
  ADD COLUMN claimmd_last_response_id VARCHAR(40) NOT NULL DEFAULT '0';

-- Account cursors are scoped to agency as shared accounts contain multiple tenants.
CREATE TABLE IF NOT EXISTS claimmd_sync_state (
  agency_id INT NOT NULL,
  connection_id VARCHAR(120) NOT NULL,
  last_response_id VARCHAR(40) NOT NULL DEFAULT '0',
  synced_at TIMESTAMP NULL,
  PRIMARY KEY (agency_id, connection_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS claimmd_claim_events (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  clinical_claim_id BIGINT NOT NULL,
  connection_id VARCHAR(120) NOT NULL,
  event_key VARCHAR(100) NOT NULL,
  event_type VARCHAR(40) NOT NULL,
  status VARCHAR(40) NULL,
  payload_encrypted MEDIUMTEXT NOT NULL,
  actor_user_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_claimmd_event (agency_id, connection_id, event_key),
  INDEX idx_claimmd_history (agency_id, clinical_claim_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS claimmd_enrollments (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  connection_id VARCHAR(120) NOT NULL,
  billing_office_location_id INT NOT NULL,
  payer_id VARCHAR(32) NOT NULL,
  enrollment_type VARCHAR(10) NOT NULL,
  provider_npi VARCHAR(10) NOT NULL,
  tax_id_hash CHAR(64) NOT NULL,
  status VARCHAR(80) NOT NULL DEFAULT 'requested',
  last_event_at DATETIME NULL,
  created_by_user_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_claimmd_enrollment (agency_id, connection_id, billing_office_location_id, payer_id, enrollment_type, provider_npi, tax_id_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS claimmd_webhook_events (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  connection_id VARCHAR(120) NOT NULL,
  event_id VARCHAR(100) NOT NULL,
  payload_encrypted MEDIUMTEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_claimmd_webhook (connection_id, event_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
