-- Migration: Bulk Client Upload core schema
-- Purpose: Add agency-editable status/insurance catalogs, provider profiles/schedules,
--          bulk import job logs, PHI access logs, and expand clients for program-specific fields.

-- === 1) Definition tables (agency-owned, editable) ===

CREATE TABLE IF NOT EXISTS client_status_definitions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  key_name VARCHAR(64) NOT NULL,
  display_name VARCHAR(128) NOT NULL,
  description TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  UNIQUE KEY uniq_client_status_def (agency_id, key_name),
  INDEX idx_client_status_agency (agency_id),
  INDEX idx_client_status_active (agency_id, is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS insurance_definitions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  key_name VARCHAR(64) NOT NULL,
  display_name VARCHAR(128) NOT NULL,
  description TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  UNIQUE KEY uniq_insurance_def (agency_id, key_name),
  INDEX idx_insurance_agency (agency_id),
  INDEX idx_insurance_active (agency_id, is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS paperwork_delivery_definitions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  key_name VARCHAR(64) NOT NULL,
  display_name VARCHAR(128) NOT NULL,
  description TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  UNIQUE KEY uniq_paperwork_delivery_def (agency_id, key_name),
  INDEX idx_paperwork_delivery_agency (agency_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS paperwork_status_definitions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  key_name VARCHAR(64) NOT NULL,
  display_name VARCHAR(128) NOT NULL,
  description TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  UNIQUE KEY uniq_paperwork_status_def (agency_id, key_name),
  INDEX idx_paperwork_status_agency (agency_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS provider_credential_definitions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  key_name VARCHAR(64) NOT NULL,
  display_name VARCHAR(128) NOT NULL,
  description TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  UNIQUE KEY uniq_provider_cred_def (agency_id, key_name),
  INDEX idx_provider_cred_agency (agency_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS provider_credential_insurance_rules (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  credential_id INT NOT NULL,
  insurance_id INT NOT NULL,
  is_allowed BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  FOREIGN KEY (credential_id) REFERENCES provider_credential_definitions(id) ON DELETE CASCADE,
  FOREIGN KEY (insurance_id) REFERENCES insurance_definitions(id) ON DELETE CASCADE,
  UNIQUE KEY uniq_cred_ins_rule (agency_id, credential_id, insurance_id),
  INDEX idx_cred_rules_agency (agency_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- === 2) Provider profile + schedule ===

CREATE TABLE IF NOT EXISTS provider_profiles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  user_id INT NOT NULL,
  status ENUM('ACTIVE','INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  credential_id INT NULL,
  display_name VARCHAR(255) NULL,
  accepts_medicaid BOOLEAN NOT NULL DEFAULT FALSE,
  accepts_commercial BOOLEAN NOT NULL DEFAULT FALSE,
  accepts_self_pay BOOLEAN NOT NULL DEFAULT FALSE,
  accepts_tricare_override BOOLEAN NOT NULL DEFAULT FALSE,
  background_check_date DATE NULL,
  background_status VARCHAR(128) NULL,
  cleared_to_start BOOLEAN NOT NULL DEFAULT FALSE,
  risk_high_behavior BOOLEAN NOT NULL DEFAULT FALSE,
  risk_suicidal BOOLEAN NOT NULL DEFAULT FALSE,
  risk_substance_use BOOLEAN NOT NULL DEFAULT FALSE,
  risk_trauma BOOLEAN NOT NULL DEFAULT FALSE,
  risk_skills BOOLEAN NOT NULL DEFAULT FALSE,
  staff_notes TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (credential_id) REFERENCES provider_credential_definitions(id) ON DELETE SET NULL,
  UNIQUE KEY uniq_provider_profile_user (agency_id, user_id),
  INDEX idx_provider_profile_agency (agency_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS provider_school_schedules (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  provider_user_id INT NOT NULL,
  school_organization_id INT NOT NULL,
  day_of_week ENUM('Monday','Tuesday','Wednesday','Thursday','Friday') NOT NULL,
  starting_available INT NOT NULL DEFAULT 0,
  notes TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  FOREIGN KEY (provider_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (school_organization_id) REFERENCES agencies(id) ON DELETE RESTRICT,
  UNIQUE KEY uniq_provider_school_day (agency_id, provider_user_id, school_organization_id, day_of_week),
  INDEX idx_provider_schedule_school (school_organization_id),
  INDEX idx_provider_schedule_agency (agency_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- === 3) Bulk import job logs ===

CREATE TABLE IF NOT EXISTS bulk_import_jobs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  uploaded_by_user_id INT NOT NULL,
  kind VARCHAR(64) NOT NULL COMMENT 'e.g., CLIENTS_ONE_TIME',
  status ENUM('RUNNING','COMPLETED','FAILED') NOT NULL DEFAULT 'RUNNING',
  total_clients_rows INT NOT NULL DEFAULT 0,
  total_providers_rows INT NOT NULL DEFAULT 0,
  total_roster_rows INT NOT NULL DEFAULT 0,
  created_count INT NOT NULL DEFAULT 0,
  updated_count INT NOT NULL DEFAULT 0,
  error_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  FOREIGN KEY (uploaded_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  INDEX idx_bulk_import_agency (agency_id),
  INDEX idx_bulk_import_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS bulk_import_job_rows (
  id INT AUTO_INCREMENT PRIMARY KEY,
  job_id INT NOT NULL,
  sheet VARCHAR(32) NOT NULL COMMENT 'clients/providers/roster',
  row_number INT NOT NULL,
  identifier VARCHAR(128) NULL COMMENT 'best-effort identifier (client_identifier_name/provider name)',
  status ENUM('SUCCESS','ERROR','SKIPPED') NOT NULL,
  message TEXT NULL,
  created_entity_id INT NULL,
  created_entity_type VARCHAR(64) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (job_id) REFERENCES bulk_import_jobs(id) ON DELETE CASCADE,
  INDEX idx_job_rows_job (job_id),
  INDEX idx_job_rows_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- === 4) PHI access audit ===

CREATE TABLE IF NOT EXISTS phi_access_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  user_id INT NOT NULL,
  client_id INT NULL,
  resource_type VARCHAR(64) NOT NULL,
  resource_id VARCHAR(128) NULL,
  action VARCHAR(64) NOT NULL DEFAULT 'OPEN',
  acknowledged_warning BOOLEAN NOT NULL DEFAULT FALSE,
  ip_address VARCHAR(64) NULL,
  user_agent TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL,
  INDEX idx_phi_agency (agency_id),
  INDEX idx_phi_user (user_id),
  INDEX idx_phi_client (client_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- === 5) Expand clients with spec fields (safe ADDs) ===

ALTER TABLE clients
  ADD COLUMN client_identifier_name VARCHAR(32) NULL AFTER initials,
  ADD COLUMN identifier_code VARCHAR(16) NULL AFTER client_identifier_name,
  ADD COLUMN referral_date DATE NULL AFTER submission_date,
  ADD COLUMN skills BOOLEAN NOT NULL DEFAULT FALSE AFTER referral_date,
  ADD COLUMN insurance_id INT NULL AFTER skills,
  ADD COLUMN client_status_id INT NULL AFTER insurance_id,
  ADD COLUMN paperwork_delivery_id INT NULL AFTER client_status_id,
  ADD COLUMN doc_date DATE NULL AFTER paperwork_delivery_id,
  ADD COLUMN paperwork_status_id INT NULL AFTER doc_date,
  ADD COLUMN assigned_day_of_week ENUM('Monday','Tuesday','Wednesday','Thursday','Friday') NULL AFTER provider_id,
  ADD COLUMN grade VARCHAR(32) NULL AFTER paperwork_status_id,
  ADD COLUMN gender VARCHAR(64) NULL AFTER grade,
  ADD COLUMN primary_client_language VARCHAR(128) NULL AFTER gender,
  ADD COLUMN primary_parent_language VARCHAR(128) NULL AFTER primary_client_language,
  ADD COLUMN internal_notes TEXT NULL AFTER primary_parent_language,
  ADD CONSTRAINT fk_clients_insurance_def FOREIGN KEY (insurance_id) REFERENCES insurance_definitions(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_clients_client_status_def FOREIGN KEY (client_status_id) REFERENCES client_status_definitions(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_clients_paperwork_delivery_def FOREIGN KEY (paperwork_delivery_id) REFERENCES paperwork_delivery_definitions(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_clients_paperwork_status_def FOREIGN KEY (paperwork_status_id) REFERENCES paperwork_status_definitions(id) ON DELETE SET NULL,
  ADD INDEX idx_clients_identifier_code (identifier_code),
  ADD INDEX idx_clients_client_status_id (client_status_id),
  ADD INDEX idx_clients_paperwork_status_id (paperwork_status_id),
  ADD INDEX idx_clients_insurance_id (insurance_id);

-- === 6) Seed defaults for existing agencies (idempotent) ===

-- Client statuses
INSERT INTO client_status_definitions (agency_id, key_name, display_name, description, is_active)
SELECT a.id, v.key_name, v.display_name, v.description, TRUE
FROM agencies a
JOIN (
  SELECT 'Current' AS key_name, 'Current' AS display_name, 'Actively receiving services' AS description
  UNION ALL SELECT 'Pending','Pending','Pending assignment or processing'
  UNION ALL SELECT 'Terminated','Terminated','Services terminated'
  UNION ALL SELECT 'Inactive','Inactive','Not currently active'
  UNION ALL SELECT 'Waitlist','Waitlist','Awaiting availability'
  UNION ALL SELECT 'Screener','Screener','In screening stage'
  UNION ALL SELECT 'Packet','Packet','Packet stage'
) v
WHERE (a.organization_type = 'agency' OR a.organization_type IS NULL)
ON DUPLICATE KEY UPDATE display_name = VALUES(display_name);

-- Insurance
INSERT INTO insurance_definitions (agency_id, key_name, display_name, description, is_active)
SELECT a.id, v.key_name, v.display_name, v.description, TRUE
FROM agencies a
JOIN (
  SELECT 'Medicaid' AS key_name, 'Medicaid' AS display_name, NULL AS description
  UNION ALL SELECT 'Tricare','Tricare',NULL
  UNION ALL SELECT 'CommercialOther','Commercial / Other',NULL
  UNION ALL SELECT 'Unknown','Unknown',NULL
  UNION ALL SELECT 'None','None',NULL
  UNION ALL SELECT 'SelfPay','Self Pay',NULL
) v
WHERE (a.organization_type = 'agency' OR a.organization_type IS NULL)
ON DUPLICATE KEY UPDATE display_name = VALUES(display_name);

-- Paperwork delivery
INSERT INTO paperwork_delivery_definitions (agency_id, key_name, display_name, description, is_active)
SELECT a.id, v.key_name, v.display_name, v.description, TRUE
FROM agencies a
JOIN (
  SELECT 'Uploaded' AS key_name, 'Uploaded' AS display_name, 'Uploaded into the system' AS description
  UNION ALL SELECT 'SchoolEmailed','School Emailed','Received via school email'
  UNION ALL SELECT 'SetHome','Set Home','Packet sent home'
  UNION ALL SELECT 'Unknown','Unknown',NULL
) v
WHERE (a.organization_type = 'agency' OR a.organization_type IS NULL)
ON DUPLICATE KEY UPDATE display_name = VALUES(display_name);

-- Paperwork status
INSERT INTO paperwork_status_definitions (agency_id, key_name, display_name, description, is_active)
SELECT a.id, v.key_name, v.display_name, v.description, TRUE
FROM agencies a
JOIN (
  SELECT 'Completed' AS key_name, 'Completed' AS display_name, NULL AS description
  UNION ALL SELECT 'ReAuth','Re-Auth',NULL
  UNION ALL SELECT 'NewInsurance','New Insurance',NULL
  UNION ALL SELECT 'InsurancePaymentAuth','Insurance / Payment Auth',NULL
  UNION ALL SELECT 'EmailedPacket','Emailed Packet',NULL
  UNION ALL SELECT 'ROI','ROI',NULL
  UNION ALL SELECT 'Renewal','Renewal',NULL
  UNION ALL SELECT 'NewDocs','New Docs',NULL
  UNION ALL SELECT 'DisclosureConsent','Disclosure and Consent',NULL
  UNION ALL SELECT 'BALANCE','BALANCE',NULL
) v
WHERE (a.organization_type = 'agency' OR a.organization_type IS NULL)
ON DUPLICATE KEY UPDATE display_name = VALUES(display_name);

-- Provider credentials
INSERT INTO provider_credential_definitions (agency_id, key_name, display_name, description, is_active)
SELECT a.id, v.key_name, v.display_name, NULL, TRUE
FROM agencies a
JOIN (
  SELECT 'Bachelors' AS key_name, 'Bachelors' AS display_name
  UNION ALL SELECT 'Intern','Intern'
  UNION ALL SELECT 'LPC','LPC'
  UNION ALL SELECT 'LPCC','LPCC'
  UNION ALL SELECT 'MFT','MFT'
  UNION ALL SELECT 'MFTC','MFTC'
  UNION ALL SELECT 'PeerProfessional','Peer Professional'
  UNION ALL SELECT 'SWC','SWC'
  UNION ALL SELECT 'LCSW','LCSW'
  UNION ALL SELECT 'LMFT','LMFT'
  UNION ALL SELECT 'Unknown','Unknown'
) v
WHERE (a.organization_type = 'agency' OR a.organization_type IS NULL)
ON DUPLICATE KEY UPDATE display_name = VALUES(display_name);

