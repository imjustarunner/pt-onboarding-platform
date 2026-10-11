-- Office devices are independent of staff login sessions. Never store setup codes or tokens.
CREATE TABLE IF NOT EXISTS office_kiosk_access (
  office_location_id INT NOT NULL PRIMARY KEY,
  code_lookup CHAR(64) NOT NULL UNIQUE,
  code_salt CHAR(32) NOT NULL,
  code_hash CHAR(128) NOT NULL,
  revision CHAR(32) NOT NULL,
  updated_by INT NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS office_kiosk_devices (
  id CHAR(32) NOT NULL PRIMARY KEY,
  office_location_id INT NOT NULL,
  credential_revision CHAR(32) NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  revoked_at DATETIME NULL,
  INDEX office_devices (office_location_id, revoked_at)
);
-- Shared by every backend instance; browser resets do not reset guessing limits.
CREATE TABLE IF NOT EXISTS office_kiosk_attempts (
  bucket_key CHAR(64) NOT NULL PRIMARY KEY,
  attempts INT NOT NULL DEFAULT 0,
  expires_at DATETIME NOT NULL,
  INDEX attempt_expiry (expires_at)
);
