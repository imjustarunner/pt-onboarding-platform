-- Migration 1012: agency (tenant) group NPIs + per-payer credentialing
-- Supports multiple Type-2 / group NPIs per agency, typically one per office location,
-- each with taxonomy, medicaid provider type, and the same payer tracking fields used
-- for individual provider credentialing.

CREATE TABLE IF NOT EXISTS agency_group_npis (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  npi_number VARCHAR(20) NOT NULL,
  label VARCHAR(255) NULL
    COMMENT 'Friendly name e.g. Main group NPI, Aurora office',
  taxonomy_code VARCHAR(32) NULL,
  medicaid_provider_type VARCHAR(128) NULL,
  office_location_id INT NULL
    COMMENT 'Typical office/location this group NPI is tied to',
  notes TEXT NULL
    COMMENT 'Notes for this group NPI across all payers',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  updated_by_user_id INT NULL,
  UNIQUE KEY uq_agency_group_npi (agency_id, npi_number),
  KEY idx_agn_agency (agency_id),
  KEY idx_agn_office (office_location_id),
  CONSTRAINT fk_agn_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_agn_office FOREIGN KEY (office_location_id) REFERENCES office_locations(id) ON DELETE SET NULL,
  CONSTRAINT fk_agn_updated_by FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS agency_group_npi_payer_credentialing (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_group_npi_id INT NOT NULL,
  insurance_credentialing_definition_id INT NOT NULL,
  effective_date DATE NULL,
  submitted_date DATE NULL,
  resubmitted_date DATE NULL,
  returned_date DATE NULL,
  welcome_letter_path VARCHAR(512) NULL,
  contract_path VARCHAR(512) NULL,
  pin_or_reference VARCHAR(128) NULL
    COMMENT 'Payer PIN / group provider ID',
  notes TEXT NULL,
  group_level_username_ciphertext TEXT NULL,
  group_level_username_iv VARCHAR(64) NULL,
  group_level_username_auth_tag VARCHAR(64) NULL,
  group_level_username_key_id VARCHAR(64) NULL,
  group_level_password_ciphertext TEXT NULL,
  group_level_password_iv VARCHAR(64) NULL,
  group_level_password_auth_tag VARCHAR(64) NULL,
  group_level_password_key_id VARCHAR(64) NULL,
  updated_by_user_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_agn_payer (agency_group_npi_id, insurance_credentialing_definition_id),
  KEY idx_agnpc_def (insurance_credentialing_definition_id),
  CONSTRAINT fk_agnpc_npi FOREIGN KEY (agency_group_npi_id) REFERENCES agency_group_npis(id) ON DELETE CASCADE,
  CONSTRAINT fk_agnpc_def FOREIGN KEY (insurance_credentialing_definition_id)
    REFERENCES insurance_credentialing_definitions(id) ON DELETE CASCADE,
  CONSTRAINT fk_agnpc_updated_by FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
