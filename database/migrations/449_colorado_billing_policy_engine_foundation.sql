/*
Colorado-first billing policy engine foundation.

Creates:
- Policy profiles + service/eligibility/source tables
- Agency policy/code activation tables
- PDF ingestion job + candidate review tables
- Learning charge policy tracking columns for enforcement/audit
*/

CREATE TABLE IF NOT EXISTS billing_policy_profiles (
  id BIGINT NOT NULL AUTO_INCREMENT,
  state_code CHAR(2) NOT NULL,
  policy_name VARCHAR(160) NOT NULL,
  version_label VARCHAR(64) NOT NULL,
  effective_start_date DATE NULL,
  effective_end_date DATE NULL,
  status ENUM('DRAFT','PUBLISHED','ARCHIVED') NOT NULL DEFAULT 'DRAFT',
  source_storage_path VARCHAR(500) NULL,
  source_file_name VARCHAR(255) NULL,
  source_sha256 CHAR(64) NULL,
  notes TEXT NULL,
  created_by_user_id INT NULL,
  published_by_user_id INT NULL,
  published_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_billing_policy_profiles_state_version (state_code, version_label),
  KEY idx_billing_policy_profiles_state_status (state_code, status),
  CONSTRAINT fk_billing_policy_profiles_created_by FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_billing_policy_profiles_published_by FOREIGN KEY (published_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS billing_policy_service_rules (
  id BIGINT NOT NULL AUTO_INCREMENT,
  billing_policy_profile_id BIGINT NOT NULL,
  service_code VARCHAR(32) NOT NULL,
  service_description TEXT NULL,
  min_minutes INT NULL,
  max_minutes INT NULL,
  unit_minutes INT NULL,
  unit_calc_mode ENUM('NONE','MEDICAID_8_MINUTE_LADDER','FIXED_BLOCK') NOT NULL DEFAULT 'NONE',
  max_units_per_day INT NULL,
  place_of_service VARCHAR(80) NULL,
  provider_type_notes TEXT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  metadata_json JSON NULL,
  created_by_user_id INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_billing_policy_service_rules_profile_code (billing_policy_profile_id, service_code),
  KEY idx_billing_policy_service_rules_code (service_code),
  CONSTRAINT fk_billing_policy_service_rules_profile FOREIGN KEY (billing_policy_profile_id) REFERENCES billing_policy_profiles(id) ON DELETE CASCADE,
  CONSTRAINT fk_billing_policy_service_rules_created_by FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS billing_policy_eligibility_rules (
  id BIGINT NOT NULL AUTO_INCREMENT,
  service_rule_id BIGINT NOT NULL,
  credential_tier VARCHAR(64) NULL,
  provider_type VARCHAR(120) NULL,
  allowed TINYINT(1) NOT NULL DEFAULT 1,
  min_minutes_override INT NULL,
  notes TEXT NULL,
  metadata_json JSON NULL,
  created_by_user_id INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_billing_policy_eligibility_rule (service_rule_id, credential_tier, provider_type),
  KEY idx_billing_policy_eligibility_credential (credential_tier),
  CONSTRAINT fk_billing_policy_eligibility_service_rule FOREIGN KEY (service_rule_id) REFERENCES billing_policy_service_rules(id) ON DELETE CASCADE,
  CONSTRAINT fk_billing_policy_eligibility_created_by FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS billing_policy_rule_sources (
  id BIGINT NOT NULL AUTO_INCREMENT,
  billing_policy_profile_id BIGINT NOT NULL,
  service_rule_id BIGINT NULL,
  source_storage_path VARCHAR(500) NULL,
  source_file_name VARCHAR(255) NULL,
  page_number INT NULL,
  citation_snippet TEXT NULL,
  metadata_json JSON NULL,
  created_by_user_id INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_billing_policy_rule_sources_profile (billing_policy_profile_id),
  KEY idx_billing_policy_rule_sources_service_rule (service_rule_id),
  CONSTRAINT fk_billing_policy_rule_sources_profile FOREIGN KEY (billing_policy_profile_id) REFERENCES billing_policy_profiles(id) ON DELETE CASCADE,
  CONSTRAINT fk_billing_policy_rule_sources_service_rule FOREIGN KEY (service_rule_id) REFERENCES billing_policy_service_rules(id) ON DELETE SET NULL,
  CONSTRAINT fk_billing_policy_rule_sources_created_by FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS agency_billing_policy_activation (
  id BIGINT NOT NULL AUTO_INCREMENT,
  agency_id INT NOT NULL,
  billing_policy_profile_id BIGINT NOT NULL,
  activated_by_user_id INT NULL,
  activated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_agency_billing_policy_activation_agency (agency_id),
  KEY idx_agency_billing_policy_activation_profile (billing_policy_profile_id),
  CONSTRAINT fk_agency_billing_policy_activation_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_agency_billing_policy_activation_profile FOREIGN KEY (billing_policy_profile_id) REFERENCES billing_policy_profiles(id) ON DELETE RESTRICT,
  CONSTRAINT fk_agency_billing_policy_activation_activated_by FOREIGN KEY (activated_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS agency_service_code_activation (
  id BIGINT NOT NULL AUTO_INCREMENT,
  agency_id INT NOT NULL,
  service_code VARCHAR(32) NOT NULL,
  is_enabled TINYINT(1) NOT NULL DEFAULT 1,
  updated_by_user_id INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_agency_service_code_activation (agency_id, service_code),
  KEY idx_agency_service_code_activation_enabled (agency_id, is_enabled),
  CONSTRAINT fk_agency_service_code_activation_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_agency_service_code_activation_updated_by FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS billing_policy_ingestion_jobs (
  id BIGINT NOT NULL AUTO_INCREMENT,
  billing_policy_profile_id BIGINT NOT NULL,
  state_code CHAR(2) NOT NULL,
  source_storage_path VARCHAR(500) NULL,
  source_file_name VARCHAR(255) NULL,
  source_sha256 CHAR(64) NULL,
  extraction_method VARCHAR(80) NULL,
  extraction_status ENUM('PENDING','COMPLETED','FAILED') NOT NULL DEFAULT 'PENDING',
  review_status ENUM('PENDING_REVIEW','PARTIALLY_REVIEWED','READY_TO_PUBLISH','PUBLISHED','FAILED') NOT NULL DEFAULT 'PENDING_REVIEW',
  extracted_text LONGTEXT NULL,
  error_text TEXT NULL,
  created_by_user_id INT NULL,
  reviewed_by_user_id INT NULL,
  published_by_user_id INT NULL,
  reviewed_at DATETIME NULL,
  published_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_billing_policy_ingestion_jobs_profile (billing_policy_profile_id),
  KEY idx_billing_policy_ingestion_jobs_review (review_status),
  CONSTRAINT fk_billing_policy_ingestion_jobs_profile FOREIGN KEY (billing_policy_profile_id) REFERENCES billing_policy_profiles(id) ON DELETE CASCADE,
  CONSTRAINT fk_billing_policy_ingestion_jobs_created_by FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_billing_policy_ingestion_jobs_reviewed_by FOREIGN KEY (reviewed_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_billing_policy_ingestion_jobs_published_by FOREIGN KEY (published_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS billing_policy_ingestion_candidates (
  id BIGINT NOT NULL AUTO_INCREMENT,
  ingestion_job_id BIGINT NOT NULL,
  service_code VARCHAR(32) NOT NULL,
  service_description TEXT NULL,
  min_minutes INT NULL,
  max_minutes INT NULL,
  unit_minutes INT NULL,
  unit_calc_mode ENUM('NONE','MEDICAID_8_MINUTE_LADDER','FIXED_BLOCK') NOT NULL DEFAULT 'NONE',
  max_units_per_day INT NULL,
  credential_tier VARCHAR(64) NULL,
  provider_type VARCHAR(120) NULL,
  source_page_number INT NULL,
  source_snippet TEXT NULL,
  raw_text_line TEXT NULL,
  status ENUM('PENDING','APPROVED','REJECTED','PUBLISHED') NOT NULL DEFAULT 'PENDING',
  review_notes TEXT NULL,
  reviewed_by_user_id INT NULL,
  reviewed_at DATETIME NULL,
  published_service_rule_id BIGINT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_billing_policy_ingestion_candidates_job (ingestion_job_id),
  KEY idx_billing_policy_ingestion_candidates_status (status),
  KEY idx_billing_policy_ingestion_candidates_code (service_code),
  CONSTRAINT fk_billing_policy_ingestion_candidates_job FOREIGN KEY (ingestion_job_id) REFERENCES billing_policy_ingestion_jobs(id) ON DELETE CASCADE,
  CONSTRAINT fk_billing_policy_ingestion_candidates_reviewed_by FOREIGN KEY (reviewed_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_billing_policy_ingestion_candidates_published_rule FOREIGN KEY (published_service_rule_id) REFERENCES billing_policy_service_rules(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE learning_session_charges
  ADD COLUMN billing_policy_profile_id BIGINT NULL AFTER idempotency_key,
  ADD COLUMN service_code VARCHAR(32) NULL AFTER billing_policy_profile_id,
  ADD COLUMN units INT NULL AFTER service_code,
  ADD COLUMN service_date DATE NULL AFTER units;

ALTER TABLE learning_session_charges
  ADD KEY idx_learning_session_charges_service_date (client_id, service_code, service_date),
  ADD KEY idx_learning_session_charges_policy_profile (billing_policy_profile_id);

ALTER TABLE learning_session_charges
  ADD CONSTRAINT fk_learning_session_charges_policy_profile
    FOREIGN KEY (billing_policy_profile_id) REFERENCES billing_policy_profiles(id) ON DELETE SET NULL;

INSERT INTO billing_policy_profiles (
  state_code, policy_name, version_label, effective_start_date, status, notes, published_at
)
SELECT
  'CO',
  'Colorado Medicaid Behavioral Health Manual',
  '2026.1',
  '2026-01-01',
  'PUBLISHED',
  'Seeded baseline policy for H2014/H2015/H0004. Review + edit through billing policy admin UI.',
  CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1 FROM billing_policy_profiles WHERE state_code = 'CO' AND version_label = '2026.1'
);

INSERT INTO billing_policy_service_rules (
  billing_policy_profile_id,
  service_code,
  service_description,
  min_minutes,
  max_minutes,
  unit_minutes,
  unit_calc_mode,
  max_units_per_day,
  place_of_service,
  provider_type_notes,
  is_active,
  metadata_json
)
SELECT
  p.id,
  seed.service_code,
  seed.service_description,
  seed.min_minutes,
  seed.max_minutes,
  seed.unit_minutes,
  seed.unit_calc_mode,
  seed.max_units_per_day,
  seed.place_of_service,
  seed.provider_type_notes,
  1,
  JSON_OBJECT('seededByMigration', 449)
FROM billing_policy_profiles p
JOIN (
  SELECT 'H2014' AS service_code, 'Skills training and development' AS service_description, 8 AS min_minutes, 15 AS max_minutes, 15 AS unit_minutes, 'MEDICAID_8_MINUTE_LADDER' AS unit_calc_mode, 12 AS max_units_per_day, 'Community' AS place_of_service, 'Credential-tier eligibility enforced' AS provider_type_notes
  UNION ALL
  SELECT 'H2015', 'Comprehensive community support services', 8, 15, 15, 'MEDICAID_8_MINUTE_LADDER', 12, 'Community', 'Credential-tier eligibility enforced'
  UNION ALL
  SELECT 'H0004', 'Behavioral health counseling and therapy', 8, 15, 15, 'MEDICAID_8_MINUTE_LADDER', 4, 'Community', 'Credential-tier eligibility enforced'
) AS seed
LEFT JOIN billing_policy_service_rules existing
  ON existing.billing_policy_profile_id = p.id
 AND existing.service_code = seed.service_code
WHERE p.state_code = 'CO'
  AND p.version_label = '2026.1'
  AND existing.id IS NULL;

INSERT INTO billing_policy_eligibility_rules (
  service_rule_id,
  credential_tier,
  provider_type,
  allowed,
  min_minutes_override,
  notes,
  metadata_json
)
SELECT
  sr.id,
  tiers.credential_tier,
  NULL,
  1,
  NULL,
  'Seeded Colorado baseline eligibility by credential tier',
  JSON_OBJECT('seededByMigration', 449)
FROM billing_policy_service_rules sr
JOIN billing_policy_profiles p
  ON p.id = sr.billing_policy_profile_id
JOIN (
  SELECT 'bachelors' AS credential_tier
  UNION ALL SELECT 'intern_plus'
  UNION ALL SELECT 'licensed_master'
  UNION ALL SELECT 'licensed_doctoral'
  UNION ALL SELECT 'qbha'
) AS tiers
LEFT JOIN billing_policy_eligibility_rules er
  ON er.service_rule_id = sr.id
 AND er.credential_tier = tiers.credential_tier
 AND er.provider_type IS NULL
WHERE p.state_code = 'CO'
  AND p.version_label = '2026.1'
  AND sr.service_code IN ('H2014', 'H2015', 'H0004')
  AND er.id IS NULL;
