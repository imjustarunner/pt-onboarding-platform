-- Platform account verification, independent of clinical agency campaigns.
CREATE TABLE IF NOT EXISTS auricwell_auth_sms (
  account_id CHAR(36) PRIMARY KEY,
  phone_key CHAR(64) NOT NULL,
  payload TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY auth_sms_phone (phone_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS auricwell_auth_sms_challenges (
  id CHAR(36) PRIMARY KEY,
  account_id CHAR(36) NOT NULL,
  session_hash CHAR(64) NULL,
  phone_key CHAR(64) NOT NULL,
  purpose VARCHAR(16) NOT NULL,
  code_hash CHAR(64) NOT NULL,
  payload TEXT NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'sending',
  provider_id VARCHAR(150) NULL,
  attempts INT NOT NULL DEFAULT 0,
  expires_at DATETIME(3) NOT NULL,
  consumed_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY auth_sms_account (account_id,created_at),
  KEY auth_sms_phone (phone_key,created_at),
  KEY auth_sms_provider (provider_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS auricwell_auth_sms_audit (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  account_id CHAR(36) NOT NULL,
  action VARCHAR(64) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
