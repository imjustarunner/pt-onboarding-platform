-- No existing relationship or auto_charge flag is promoted to payer consent.
-- Run the application backfill script after this additive migration to encrypt
-- legacy fields. New writes fail closed when the dedicated key is unavailable.
ALTER TABLE guardian_insurance_profiles ADD COLUMN private_payload JSON NULL;
ALTER TABLE clients ADD COLUMN billing_insurance_payload JSON NULL;
ALTER TABLE guardian_payment_cards
  ADD COLUMN private_payload JSON NULL,
  ADD COLUMN method_fingerprint CHAR(64) NULL,
  ADD COLUMN stripe_setup_intent_id VARCHAR(255) NULL,
  ADD UNIQUE KEY uq_gpc_method_fingerprint (method_fingerprint);

CREATE TABLE client_billing_payers (
  agency_id INT NOT NULL,
  client_id INT NOT NULL,
  guardian_user_id INT NOT NULL,
  status ENUM('active','revoked') NOT NULL DEFAULT 'active',
  payment_card_id BIGINT NULL,
  consent_id BIGINT NULL,
  recurring_limit_cents INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (agency_id, client_id, guardian_user_id),
  FOREIGN KEY (agency_id) REFERENCES agencies(id),
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  FOREIGN KEY (guardian_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (payment_card_id) REFERENCES guardian_payment_cards(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE guardian_billing_consents (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  guardian_user_id INT NOT NULL,
  client_id INT NULL,
  payment_card_id BIGINT NULL,
  intake_submission_id BIGINT NULL,
  purpose VARCHAR(40) NOT NULL,
  terms_version VARCHAR(80) NOT NULL,
  terms_hash CHAR(64) NOT NULL,
  evidence_encrypted JSON NOT NULL,
  accepted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at TIMESTAMP NULL,
  INDEX idx_gbc_owner (agency_id, guardian_user_id, client_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE guardian_insurance_clients (
  profile_id BIGINT NOT NULL,
  client_id INT NOT NULL,
  agency_id INT NOT NULL,
  confirmed_by_user_id INT NOT NULL,
  confirmed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (profile_id, client_id),
  FOREIGN KEY (profile_id) REFERENCES guardian_insurance_profiles(id) ON DELETE CASCADE,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE guardian_card_setups (
  setup_intent_id VARCHAR(255) PRIMARY KEY,
  agency_id INT NOT NULL,
  guardian_user_id INT NOT NULL,
  intake_submission_id BIGINT NULL,
  stripe_account_id VARCHAR(255) NOT NULL,
  private_payload JSON NOT NULL,
  payment_card_id BIGINT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_gcs_owner (agency_id, guardian_user_id, intake_submission_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE family_billing_audit (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  actor_user_id INT NULL,
  client_id INT NULL,
  action VARCHAR(80) NOT NULL,
  object_id BIGINT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_fba_client (agency_id, client_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Tutoring class sessions use a different session table from office bookings.
-- Preserve both source links so automatic charges appear in the real ledger.
ALTER TABLE learning_session_charges
  MODIFY COLUMN learning_program_session_id BIGINT NULL,
  ADD COLUMN learning_class_session_id BIGINT NULL,
  ADD UNIQUE KEY uq_family_class_charge (agency_id, learning_class_session_id, client_id),
  ADD CONSTRAINT fk_family_class_charge FOREIGN KEY (learning_class_session_id)
    REFERENCES learning_class_sessions(id) ON DELETE SET NULL;
