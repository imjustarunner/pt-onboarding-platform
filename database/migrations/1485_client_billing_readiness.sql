-- No client is implicitly self-pay. Existing clinical balances require review.
CREATE TABLE client_billing_readiness (
  agency_id INT NOT NULL,
  client_id INT NOT NULL,
  coverage_mode ENUM('unknown','insured','self_pay') NOT NULL DEFAULT 'unknown',
  setup_status ENUM('incomplete','ready','paused') NOT NULL DEFAULT 'incomplete',
  collection_policy ENUM('manual','verified_copay','after_era') NOT NULL DEFAULT 'manual',
  insurance_fingerprint CHAR(64) NULL,
  automatic_from DATETIME(3) NULL,
  evidence_encrypted LONGTEXT NOT NULL,
  updated_by_user_id INT NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (agency_id,client_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE family_receivables ADD COLUMN insurance_fingerprint CHAR(64) NULL;
