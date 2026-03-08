-- Migration: create client_guardian_intake_profiles
-- Stores latest guardian details collected from public intake/ROI in encrypted form.

CREATE TABLE IF NOT EXISTS client_guardian_intake_profiles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  client_id INT NOT NULL,
  profile_encrypted LONGTEXT NOT NULL,
  encryption_iv_b64 VARCHAR(256) NULL,
  encryption_auth_tag_b64 VARCHAR(256) NULL,
  encryption_key_id VARCHAR(64) NULL,
  source VARCHAR(50) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_client_guardian_intake_profiles_client (client_id),
  INDEX idx_client_guardian_intake_profiles_updated (updated_at),
  CONSTRAINT fk_client_guardian_intake_profiles_client
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

