-- Migration: Guardian–client reusable waivers (profile, history, attestations, kiosk confirmations)
-- Description:
-- - Per (guardian_user_id, client_id) JSON sections with signature-backed history
-- - Optional program_site / company_event JSON for which sections are required at kiosk

CREATE TABLE IF NOT EXISTS guardian_client_waiver_profiles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  guardian_user_id INT NOT NULL,
  client_id INT NOT NULL,
  sections_json JSON NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_guardian_client_waiver_profile (guardian_user_id, client_id),
  INDEX idx_gcw_profile_guardian (guardian_user_id),
  INDEX idx_gcw_profile_client (client_id),
  CONSTRAINT fk_gcw_profile_guardian
    FOREIGN KEY (guardian_user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_gcw_profile_client
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS guardian_client_waiver_attestations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  profile_id INT NOT NULL,
  section_key VARCHAR(64) NOT NULL,
  action VARCHAR(32) NOT NULL COMMENT 'create | update | revoke',
  signature_data MEDIUMTEXT NOT NULL,
  consent_acknowledged_at DATETIME NULL,
  intent_to_sign_at DATETIME NULL,
  ip_address VARCHAR(45) NULL,
  user_agent TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_gcw_attest_profile (profile_id),
  INDEX idx_gcw_attest_section (profile_id, section_key),
  CONSTRAINT fk_gcw_attest_profile
    FOREIGN KEY (profile_id) REFERENCES guardian_client_waiver_profiles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS guardian_client_waiver_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  profile_id INT NOT NULL,
  section_key VARCHAR(64) NOT NULL,
  action VARCHAR(32) NOT NULL,
  payload_json JSON NULL,
  attestation_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_gcw_hist_profile_time (profile_id, created_at),
  INDEX idx_gcw_hist_section (profile_id, section_key),
  CONSTRAINT fk_gcw_hist_profile
    FOREIGN KEY (profile_id) REFERENCES guardian_client_waiver_profiles(id) ON DELETE CASCADE,
  CONSTRAINT fk_gcw_hist_attest
    FOREIGN KEY (attestation_id) REFERENCES guardian_client_waiver_attestations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS guardian_client_waiver_kiosk_confirmations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  profile_id INT NOT NULL,
  kiosk_location_id INT NOT NULL,
  program_site_id INT NOT NULL,
  guardian_user_id INT NOT NULL,
  client_id INT NOT NULL,
  program_time_punch_id INT NULL,
  required_sections_json JSON NULL,
  sections_snapshot_json JSON NULL,
  confirmed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_gcw_kiosk_punch (program_time_punch_id),
  INDEX idx_gcw_kiosk_guardian_client (guardian_user_id, client_id, confirmed_at),
  CONSTRAINT fk_gcw_kiosk_profile
    FOREIGN KEY (profile_id) REFERENCES guardian_client_waiver_profiles(id) ON DELETE CASCADE,
  CONSTRAINT fk_gcw_kiosk_location
    FOREIGN KEY (kiosk_location_id) REFERENCES office_locations(id) ON DELETE CASCADE,
  CONSTRAINT fk_gcw_kiosk_site
    FOREIGN KEY (program_site_id) REFERENCES program_sites(id) ON DELETE CASCADE,
  CONSTRAINT fk_gcw_kiosk_guardian
    FOREIGN KEY (guardian_user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_gcw_kiosk_client
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  CONSTRAINT fk_gcw_kiosk_punch
    FOREIGN KEY (program_time_punch_id) REFERENCES program_time_punches(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Optional: restrict which waiver sections are required at a program site (NULL = all standard sections).
-- Plain ALTER (no PREPARE/EXECUTE): mysql2 pool.execute() uses the prepared-statement protocol, which
-- rejects PREPARE/EXECUTE. Duplicate column errors are treated as idempotent skips by database/run-migrations.js.
ALTER TABLE program_sites
  ADD COLUMN guardian_waiver_required_sections_json JSON NULL DEFAULT NULL
  COMMENT 'JSON array of section keys. NULL means all defaults'
  AFTER office_location_id;

-- Optional: override required sections when tied to a company event (future / Skill Builders flows).
ALTER TABLE company_events
  ADD COLUMN guardian_waiver_required_sections_json JSON NULL DEFAULT NULL
  COMMENT 'JSON array of section keys. NULL falls back to program site or defaults'
  AFTER is_active;
