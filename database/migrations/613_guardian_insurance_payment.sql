-- Migration 613: Guardian insurance profiles and payment card references
-- Stores insurance data collected during intake and QuickBooks Payments card
-- references linked to guardian user accounts.

CREATE TABLE IF NOT EXISTS guardian_insurance_profiles (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  guardian_user_id INT NOT NULL,
  client_id INT NULL COMMENT 'Client this insurance record is for (NULL = applies to all)',
  agency_id INT NOT NULL,
  intake_submission_id BIGINT NULL,
  -- Primary insurance
  primary_insurer_name VARCHAR(255) NULL,
  primary_member_id VARCHAR(128) NULL,
  primary_group_number VARCHAR(128) NULL,
  primary_subscriber_name VARCHAR(255) NULL,
  primary_is_medicaid TINYINT(1) NOT NULL DEFAULT 0,
  primary_card_front_url VARCHAR(1024) NULL COMMENT 'GCS URL for front of insurance card',
  primary_card_back_url VARCHAR(1024) NULL COMMENT 'GCS URL for back of insurance card',
  -- Secondary insurance (optional)
  secondary_insurer_name VARCHAR(255) NULL,
  secondary_member_id VARCHAR(128) NULL,
  secondary_group_number VARCHAR(128) NULL,
  secondary_subscriber_name VARCHAR(255) NULL,
  secondary_is_medicaid TINYINT(1) NOT NULL DEFAULT 0,
  secondary_card_front_url VARCHAR(1024) NULL,
  secondary_card_back_url VARCHAR(1024) NULL,
  -- Meta
  collected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  notes TEXT NULL,
  INDEX idx_gip_guardian (guardian_user_id),
  INDEX idx_gip_client (client_id),
  INDEX idx_gip_agency (agency_id),
  INDEX idx_gip_submission (intake_submission_id),
  CONSTRAINT fk_gip_guardian FOREIGN KEY (guardian_user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_gip_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL,
  CONSTRAINT fk_gip_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS guardian_payment_cards (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  guardian_user_id INT NOT NULL,
  agency_id INT NOT NULL,
  -- QuickBooks Payments references
  qb_payment_customer_id VARCHAR(255) NULL COMMENT 'QuickBooks Payments customerId',
  qb_card_id VARCHAR(255) NOT NULL COMMENT 'QuickBooks Payments card entity id',
  card_brand VARCHAR(64) NULL COMMENT 'Visa, Mastercard, etc.',
  card_last4 VARCHAR(4) NULL,
  card_exp_month VARCHAR(2) NULL,
  card_exp_year VARCHAR(4) NULL,
  cardholder_name VARCHAR(255) NULL,
  -- Billing settings
  auto_charge TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Charge automatically at session start',
  is_default TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Default card for this guardian+agency combo',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  -- Intake linkage
  intake_submission_id BIGINT NULL,
  added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_gpc_guardian (guardian_user_id),
  INDEX idx_gpc_agency (agency_id),
  UNIQUE KEY uq_gpc_qb_card (agency_id, qb_card_id),
  CONSTRAINT fk_gpc_guardian FOREIGN KEY (guardian_user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_gpc_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
