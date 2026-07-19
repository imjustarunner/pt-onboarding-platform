-- Migration 973: Encrypted Claim.MD credentials per agency (never in feature_flags)
CREATE TABLE IF NOT EXISTS agency_claimmd_credentials (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  account_id VARCHAR(120) NULL,
  account_key_enc LONGTEXT NOT NULL COMMENT 'encryptChatText JSON envelope of Claim.MD AccountKey',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_by_user_id INT NULL,
  updated_by_user_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_agency_claimmd (agency_id),
  CONSTRAINT fk_claimmd_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
