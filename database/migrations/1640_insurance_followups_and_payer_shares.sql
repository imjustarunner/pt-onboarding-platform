ALTER TABLE family_receivable_allocations
  ADD COLUMN share_basis_points INT UNSIGNED NULL;
ALTER TABLE family_receivable_allocations ADD COLUMN share_basis VARCHAR(20) NULL;
CREATE TABLE IF NOT EXISTS insurance_card_followups (
  profile_id BIGINT NOT NULL PRIMARY KEY,
  agency_id INT NOT NULL,
  cycle_hash CHAR(64) NOT NULL DEFAULT '',
  state VARCHAR(20) NOT NULL DEFAULT 'missing',
  missing_slots_json JSON NULL,
  rejected_slots_json JSON NULL,
  first_requested_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  next_check_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  snoozed_until DATETIME NULL,
  email_enabled TINYINT(1) NOT NULL DEFAULT 1,
  review_encrypted LONGTEXT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_insurance_followup_due (next_check_at, agency_id)
);
CREATE TABLE IF NOT EXISTS insurance_card_deliveries (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  profile_id BIGINT NOT NULL,
  cycle_hash CHAR(64) NOT NULL,
  ordinal INT NOT NULL,
  status VARCHAR(20) NOT NULL,
  communication_id BIGINT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_insurance_card_delivery (profile_id, cycle_hash, ordinal)
);
CREATE TABLE IF NOT EXISTS insurance_card_reminder_settings (
  agency_id INT NOT NULL PRIMARY KEY,
  enabled TINYINT(1) NOT NULL DEFAULT 0,
  updated_by_user_id INT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS insurance_card_reviews (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  profile_id BIGINT NOT NULL,
  agency_id INT NOT NULL,
  actor_user_id INT NOT NULL,
  cycle_hash CHAR(64) NOT NULL,
  action VARCHAR(40) NOT NULL,
  evidence_encrypted LONGTEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_insurance_review_profile (agency_id,profile_id,id)
);
