-- Migration: Skill builder eligibility + availability confirmations
-- Purpose:
-- - Add a provider-level boolean for Skill Builder program eligibility
-- - Store recurring weekly Skill Builder availability blocks
-- - Track weekly confirmations (must be >= 6 hours/week or confirm existing)

ALTER TABLE users
  ADD COLUMN skill_builder_eligible BOOLEAN NOT NULL DEFAULT FALSE
  AFTER in_office_available;

CREATE TABLE IF NOT EXISTS provider_skill_builder_availability (
  id INT NOT NULL AUTO_INCREMENT,
  agency_id INT NOT NULL,
  provider_id INT NOT NULL,
  day_of_week VARCHAR(16) NOT NULL,
  block_type ENUM('AFTER_SCHOOL','WEEKEND','CUSTOM') NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_psba_agency_provider (agency_id, provider_id),
  INDEX idx_psba_provider (provider_id),
  CONSTRAINT fk_provider_skill_builder_availability_agency
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_provider_skill_builder_availability_provider
    FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS provider_skill_builder_availability_confirmations (
  id INT NOT NULL AUTO_INCREMENT,
  agency_id INT NOT NULL,
  provider_id INT NOT NULL,
  week_start_date DATE NOT NULL,
  confirmed_at DATETIME NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_psbac_week (agency_id, provider_id, week_start_date),
  INDEX idx_psbac_agency_week (agency_id, week_start_date),
  INDEX idx_psbac_provider_week (provider_id, week_start_date),
  CONSTRAINT fk_provider_skill_builder_availability_confirmations_agency
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_provider_skill_builder_availability_confirmations_provider
    FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

