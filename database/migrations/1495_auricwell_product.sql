-- Additive product boundary. Existing agencies, users, credentials and sessions are untouched.
CREATE TABLE IF NOT EXISTS auricwell_practices (
  id CHAR(36) PRIMARY KEY,
  agency_id INT NULL,
  slug VARCHAR(100) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  product VARCHAR(32) NOT NULL DEFAULT 'auricwell_ehr',
  status VARCHAR(24) NOT NULL DEFAULT 'setup',
  settings MEDIUMTEXT NOT NULL,
  revision INT NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY aw_agency (agency_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS auricwell_accounts (
  id CHAR(36) PRIMARY KEY,
  username VARCHAR(80) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NULL,
  profile TEXT NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'pending',
  mfa_secret TEXT NULL,
  mfa_counter BIGINT NOT NULL DEFAULT -1,
  recovery_hashes TEXT NULL,
  failed_attempts INT NOT NULL DEFAULT 0,
  locked_until DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS auricwell_memberships (
  practice_id CHAR(36) NOT NULL,
  account_id CHAR(36) NOT NULL,
  permissions JSON NOT NULL,
  patient_ids JSON NOT NULL,
  billing_patient_ids JSON NULL,
  actor_type VARCHAR(24) NOT NULL DEFAULT 'staff',
  status VARCHAR(24) NOT NULL DEFAULT 'active',
  PRIMARY KEY (practice_id, account_id),
  FOREIGN KEY (practice_id) REFERENCES auricwell_practices(id),
  FOREIGN KEY (account_id) REFERENCES auricwell_accounts(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS auricwell_sessions (
  token_hash CHAR(64) PRIMARY KEY,
  account_id CHAR(36) NOT NULL,
  mfa_verified TINYINT(1) NOT NULL DEFAULT 0,
  expires_at DATETIME(3) NOT NULL,
  last_seen_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (account_id) REFERENCES auricwell_accounts(id),
  INDEX aw_session_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS auricwell_account_tokens (
  token_hash CHAR(64) PRIMARY KEY,
  account_id CHAR(36) NOT NULL,
  purpose VARCHAR(24) NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  consumed_at DATETIME(3) NULL,
  FOREIGN KEY (account_id) REFERENCES auricwell_accounts(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Payloads are authenticated-encrypted with practice, kind and record ID as AAD.
-- Unique source keys make reviewed imports and financial commands idempotent.
CREATE TABLE IF NOT EXISTS auricwell_records (
  id CHAR(36) PRIMARY KEY,
  practice_id CHAR(36) NOT NULL,
  kind VARCHAR(40) NOT NULL,
  patient_id CHAR(36) NULL,
  source_key VARCHAR(191) NULL,
  payload MEDIUMTEXT NOT NULL,
  revision INT NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (practice_id) REFERENCES auricwell_practices(id),
  UNIQUE KEY aw_source (practice_id, kind, source_key),
  INDEX aw_chart (practice_id, kind, patient_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS auricwell_audit (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  practice_id CHAR(36) NOT NULL,
  actor_id CHAR(36) NOT NULL,
  action VARCHAR(80) NOT NULL,
  record_id CHAR(36) NULL,
  details MEDIUMTEXT NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX aw_audit_practice (practice_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
