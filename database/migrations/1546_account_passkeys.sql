-- Discoverable credentials and one-use, browser-bound WebAuthn challenges.
CREATE TABLE IF NOT EXISTS account_passkey_accounts (
 user_id INT NOT NULL PRIMARY KEY,
 user_handle VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
 protection_enabled TINYINT(1) NOT NULL DEFAULT 0,
 recovery_hashes JSON NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
);
CREATE TABLE IF NOT EXISTS account_passkeys (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 user_id INT NOT NULL,
 credential_id VARCHAR(1400) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 credential_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
 public_key BLOB NOT NULL,
 signature_counter BIGINT UNSIGNED NOT NULL DEFAULT 0,
 rp_id VARCHAR(253) NOT NULL,
 transports JSON NULL,
 label VARCHAR(100) NOT NULL,
 backed_up TINYINT(1) NOT NULL DEFAULT 0,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 last_used_at DATETIME(3) NULL,
 revoked_at DATETIME(3) NULL,
 INDEX idx_passkey_user (user_id, revoked_at)
);
CREATE TABLE IF NOT EXISTS account_passkey_challenges (
 id CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
 browser_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 challenge VARCHAR(256) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 purpose VARCHAR(20) NOT NULL,
 user_id INT NULL,
 session_key CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
 origin VARCHAR(300) NOT NULL,
 rp_id VARCHAR(253) NOT NULL,
 label VARCHAR(100) NULL,
 expires_at DATETIME(3) NOT NULL,
 INDEX idx_passkey_challenge_expiry (expires_at)
);
CREATE TABLE IF NOT EXISTS account_passkey_proofs (
 session_key CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
 user_id INT NOT NULL,
 credential_id BIGINT UNSIGNED NULL,
 method VARCHAR(20) NOT NULL,
 verified_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 INDEX idx_passkey_proof_user (user_id)
);
