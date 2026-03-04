-- Migration: Credentialing overhaul foundation
-- Description: Add credential privilege, insurance definitions, per-user insurance credentialing,
--   locations, and change log for the credentialing page overhaul.

-- 1) Credential privilege on user_agencies
ALTER TABLE user_agencies
  ADD COLUMN can_manage_credentialing TINYINT(1) NOT NULL DEFAULT 0 AFTER has_department_access;

CREATE INDEX idx_user_agencies_credentialing
  ON user_agencies (agency_id, can_manage_credentialing, user_id);

-- 2) Insurance credentialing definitions (agency-configurable)
CREATE TABLE IF NOT EXISTS insurance_credentialing_definitions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  parent_id INT NULL COMMENT 'For sub-insurances e.g. First Health under Aetna',
  contact_phone VARCHAR(64) NULL,
  contact_email VARCHAR(255) NULL,
  login_username_ciphertext TEXT NULL,
  login_username_iv VARCHAR(64) NULL,
  login_username_auth_tag VARCHAR(64) NULL,
  login_username_key_id VARCHAR(64) NULL,
  login_password_ciphertext TEXT NULL,
  login_password_iv VARCHAR(64) NULL,
  login_password_auth_tag VARCHAR(64) NULL,
  login_password_key_id VARCHAR(64) NULL,
  reminder_notes TEXT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_id) REFERENCES insurance_credentialing_definitions(id) ON DELETE SET NULL,
  INDEX idx_insurance_cred_agency (agency_id),
  INDEX idx_insurance_cred_parent (parent_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3) Per-user, per-insurance credentialing status
CREATE TABLE IF NOT EXISTS user_insurance_credentialing (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  insurance_credentialing_definition_id INT NOT NULL,
  effective_date DATE NULL,
  submitted_date DATE NULL,
  resubmitted_date DATE NULL,
  user_level_username_ciphertext TEXT NULL,
  user_level_username_iv VARCHAR(64) NULL,
  user_level_username_auth_tag VARCHAR(64) NULL,
  user_level_username_key_id VARCHAR(64) NULL,
  user_level_password_ciphertext TEXT NULL,
  user_level_password_iv VARCHAR(64) NULL,
  user_level_password_auth_tag VARCHAR(64) NULL,
  user_level_password_key_id VARCHAR(64) NULL,
  pin_or_reference VARCHAR(128) NULL,
  notes TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  updated_by_user_id INT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (insurance_credentialing_definition_id) REFERENCES insurance_credentialing_definitions(id) ON DELETE CASCADE,
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE KEY uniq_user_insurance (user_id, insurance_credentialing_definition_id),
  INDEX idx_uic_user (user_id),
  INDEX idx_uic_insurance (insurance_credentialing_definition_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4) Locations and effective dates per user-insurance
CREATE TABLE IF NOT EXISTS user_insurance_credentialing_locations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_insurance_credentialing_id INT NOT NULL,
  location_name VARCHAR(255) NOT NULL,
  effective_date DATE NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_insurance_credentialing_id) REFERENCES user_insurance_credentialing(id) ON DELETE CASCADE,
  INDEX idx_uicl_parent (user_insurance_credentialing_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5) Credentialing change log (timeline)
CREATE TABLE IF NOT EXISTS credentialing_change_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  agency_id INT NOT NULL,
  field_changed VARCHAR(128) NOT NULL,
  old_value TEXT NULL,
  new_value TEXT NULL,
  changed_by_user_id INT NULL,
  changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  insurance_credentialing_definition_id INT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  FOREIGN KEY (changed_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (insurance_credentialing_definition_id) REFERENCES insurance_credentialing_definitions(id) ON DELETE SET NULL,
  INDEX idx_cred_log_user (user_id),
  INDEX idx_cred_log_agency (agency_id),
  INDEX idx_cred_log_changed_at (changed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
