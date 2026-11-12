-- Standalone payroll tenants use existing payroll records and ordinary auth users.
-- Uploaded names never identify or attach an account outside this tenant.
CREATE TABLE IF NOT EXISTS noteworthy_practices (
  agency_id INT NOT NULL PRIMARY KEY,
  owner_user_id INT NOT NULL,
  plan_intent ENUM('essential','growth','enterprise') NOT NULL DEFAULT 'essential',
  activation_enc LONGTEXT NULL,
  activated_at DATETIME NULL,
  activated_by_user_id INT NULL,
  activation_requested_at DATETIME NULL,
  activation_request_enc LONGTEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (agency_id) REFERENCES agencies(id),
  FOREIGN KEY (owner_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS noteworthy_signups (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(254) NOT NULL,
  practice_name VARCHAR(160) NOT NULL,
  plan_intent ENUM('essential','growth','enterprise') NOT NULL DEFAULT 'essential',
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  token_hash CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  verified_agency_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY noteworthy_signup_email (email),
  UNIQUE KEY noteworthy_signup_token (token_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS noteworthy_roster (
  agency_id INT NOT NULL,
  payroll_user_id INT NOT NULL,
  source_name_key VARCHAR(255) NOT NULL,
  credential VARCHAR(80) NULL,
  contact_email VARCHAR(254) NULL,
  auth_user_id INT NULL,
  invited_at DATETIME NULL,
  accepted_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (agency_id,payroll_user_id),
  UNIQUE KEY noteworthy_roster_source (agency_id,source_name_key),
  UNIQUE KEY noteworthy_roster_login (agency_id,auth_user_id),
  FOREIGN KEY (agency_id) REFERENCES noteworthy_practices(agency_id),
  FOREIGN KEY (payroll_user_id) REFERENCES users(id),
  FOREIGN KEY (auth_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS noteworthy_email_verifications (
  user_id INT NOT NULL PRIMARY KEY,
  email VARCHAR(254) NOT NULL,
  token_hash CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  UNIQUE KEY noteworthy_account_verify_token (token_hash),
  FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS noteworthy_employee_invites (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  payroll_user_id INT NOT NULL,
  email VARCHAR(254) NOT NULL,
  token_hash CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  accepted_at DATETIME NULL,
  invited_by_user_id INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY noteworthy_invite_token (token_hash),
  KEY noteworthy_invite_roster (agency_id,payroll_user_id),
  FOREIGN KEY (agency_id,payroll_user_id) REFERENCES noteworthy_roster(agency_id,payroll_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS noteworthy_credential_rates (
  agency_id INT NOT NULL,
  credential VARCHAR(80) NOT NULL,
  rates_json JSON NOT NULL,
  updated_by_user_id INT NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (agency_id,credential),
  FOREIGN KEY (agency_id) REFERENCES noteworthy_practices(agency_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS noteworthy_import_receipts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  payroll_period_id INT NOT NULL,
  file_sha256 CHAR(64) NOT NULL,
  status ENUM('processing','complete','failed') NOT NULL DEFAULT 'processing',
  payroll_import_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY noteworthy_import_content (agency_id,payroll_period_id,file_sha256),
  FOREIGN KEY (agency_id) REFERENCES noteworthy_practices(agency_id),
  FOREIGN KEY (payroll_period_id) REFERENCES payroll_periods(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
