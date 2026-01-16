-- Migration: Bulk Client Upload foundation (catalogs, schedules, logs)
-- Description: Adds agency/school configurable catalogs, provider scheduling/availability,
--              bulk import job logging, and PHI access logging. Extends clients for program fields.

-- -----------------------------
-- Catalogs (agency-configurable)
-- -----------------------------

CREATE TABLE IF NOT EXISTS client_statuses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  status_key VARCHAR(64) NOT NULL,
  label VARCHAR(255) NOT NULL,
  description TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  UNIQUE KEY uniq_client_status (agency_id, status_key),
  INDEX idx_client_status_agency (agency_id),
  INDEX idx_client_status_active (agency_id, is_active)
);

CREATE TABLE IF NOT EXISTS paperwork_statuses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  status_key VARCHAR(64) NOT NULL,
  label VARCHAR(255) NOT NULL,
  description TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  UNIQUE KEY uniq_paperwork_status (agency_id, status_key),
  INDEX idx_paperwork_status_agency (agency_id),
  INDEX idx_paperwork_status_active (agency_id, is_active)
);

CREATE TABLE IF NOT EXISTS insurance_types (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  insurance_key VARCHAR(64) NOT NULL,
  label VARCHAR(255) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  UNIQUE KEY uniq_insurance_type (agency_id, insurance_key),
  INDEX idx_insurance_agency (agency_id),
  INDEX idx_insurance_active (agency_id, is_active)
);

-- Paperwork delivery methods are configurable at the school level (scoped to school org).
CREATE TABLE IF NOT EXISTS paperwork_delivery_methods (
  id INT AUTO_INCREMENT PRIMARY KEY,
  school_organization_id INT NOT NULL COMMENT 'agencies.id where organization_type = school',
  method_key VARCHAR(64) NOT NULL,
  label VARCHAR(255) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (school_organization_id) REFERENCES agencies(id) ON DELETE CASCADE,
  UNIQUE KEY uniq_delivery_method (school_organization_id, method_key),
  INDEX idx_delivery_school (school_organization_id),
  INDEX idx_delivery_active (school_organization_id, is_active)
);

-- Provider credentials + insurance eligibility mapping
CREATE TABLE IF NOT EXISTS provider_credentials (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  credential_key VARCHAR(64) NOT NULL,
  label VARCHAR(255) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  UNIQUE KEY uniq_provider_credential (agency_id, credential_key),
  INDEX idx_credential_agency (agency_id),
  INDEX idx_credential_active (agency_id, is_active)
);

CREATE TABLE IF NOT EXISTS credential_insurance_eligibility (
  credential_id INT NOT NULL,
  insurance_type_id INT NOT NULL,
  is_allowed BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (credential_id, insurance_type_id),
  FOREIGN KEY (credential_id) REFERENCES provider_credentials(id) ON DELETE CASCADE,
  FOREIGN KEY (insurance_type_id) REFERENCES insurance_types(id) ON DELETE CASCADE,
  INDEX idx_elig_insurance (insurance_type_id)
);

-- Provider-level overrides (e.g., Tricare allowed per provider)
CREATE TABLE IF NOT EXISTS provider_insurance_overrides (
  provider_user_id INT NOT NULL,
  insurance_type_id INT NOT NULL,
  is_allowed BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (provider_user_id, insurance_type_id),
  FOREIGN KEY (provider_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (insurance_type_id) REFERENCES insurance_types(id) ON DELETE CASCADE,
  INDEX idx_provider_override_ins (insurance_type_id)
);

-- -----------------------------
-- School profile (district)
-- -----------------------------

CREATE TABLE IF NOT EXISTS school_profiles (
  school_organization_id INT PRIMARY KEY,
  district_name VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (school_organization_id) REFERENCES agencies(id) ON DELETE CASCADE
);

-- -----------------------------
-- Provider scheduling / availability
-- -----------------------------

CREATE TABLE IF NOT EXISTS provider_school_assignments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  provider_user_id INT NOT NULL,
  school_organization_id INT NOT NULL,
  day_of_week ENUM('Monday','Tuesday','Wednesday','Thursday','Friday') NOT NULL,
  slots_total INT NOT NULL DEFAULT 0,
  slots_available INT NOT NULL DEFAULT 0,
  start_time TIME NULL,
  end_time TIME NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (provider_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (school_organization_id) REFERENCES agencies(id) ON DELETE CASCADE,
  UNIQUE KEY uniq_provider_school_day (provider_user_id, school_organization_id, day_of_week),
  INDEX idx_provider_school (provider_user_id, school_organization_id),
  INDEX idx_school_day (school_organization_id, day_of_week)
);

-- -----------------------------
-- Bulk import job logging
-- -----------------------------

CREATE TABLE IF NOT EXISTS bulk_import_jobs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  uploaded_by_user_id INT NOT NULL,
  file_name VARCHAR(500) NOT NULL,
  started_at TIMESTAMP NULL,
  finished_at TIMESTAMP NULL,
  total_rows INT NOT NULL DEFAULT 0,
  success_rows INT NOT NULL DEFAULT 0,
  failed_rows INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  FOREIGN KEY (uploaded_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_bulk_job_agency (agency_id),
  INDEX idx_bulk_job_created (created_at)
);

CREATE TABLE IF NOT EXISTS bulk_import_job_rows (
  id INT AUTO_INCREMENT PRIMARY KEY,
  job_id INT NOT NULL,
  row_number INT NOT NULL,
  status ENUM('success','failed') NOT NULL,
  message TEXT NULL,
  entity_ids JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (job_id) REFERENCES bulk_import_jobs(id) ON DELETE CASCADE,
  UNIQUE KEY uniq_job_row (job_id, row_number),
  INDEX idx_job_status (job_id, status)
);

-- -----------------------------
-- PHI access logging
-- -----------------------------

CREATE TABLE IF NOT EXISTS phi_access_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  client_id INT NULL,
  document_id INT NULL,
  action VARCHAR(64) NOT NULL,
  ip_address VARCHAR(64) NULL,
  user_agent VARCHAR(512) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL,
  INDEX idx_phi_user (user_id),
  INDEX idx_phi_client (client_id),
  INDEX idx_phi_created (created_at)
);

-- -----------------------------
-- Extend clients for program fields
-- -----------------------------

ALTER TABLE clients
  ADD COLUMN referral_date DATE NULL COMMENT 'Initial referral date (immutable after set)',
  ADD COLUMN client_status_id INT NULL,
  ADD COLUMN paperwork_status_id INT NULL,
  ADD COLUMN insurance_type_id INT NULL,
  ADD COLUMN paperwork_delivery_method_id INT NULL,
  ADD COLUMN doc_date DATE NULL,
  ADD COLUMN grade VARCHAR(32) NULL,
  ADD COLUMN gender VARCHAR(64) NULL,
  ADD COLUMN identifier_code VARCHAR(6) NULL,
  ADD COLUMN primary_client_language VARCHAR(64) NULL,
  ADD COLUMN primary_parent_language VARCHAR(64) NULL,
  ADD COLUMN skills BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN internal_notes TEXT NULL,
  ADD COLUMN service_day ENUM('Monday','Tuesday','Wednesday','Thursday','Friday') NULL,
  ADD COLUMN paperwork_received_at TIMESTAMP NULL,
  ADD COLUMN cleared_to_start BOOLEAN NOT NULL DEFAULT FALSE,
  ADD CONSTRAINT fk_clients_client_status FOREIGN KEY (client_status_id) REFERENCES client_statuses(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_clients_paperwork_status FOREIGN KEY (paperwork_status_id) REFERENCES paperwork_statuses(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_clients_insurance FOREIGN KEY (insurance_type_id) REFERENCES insurance_types(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_clients_delivery_method FOREIGN KEY (paperwork_delivery_method_id) REFERENCES paperwork_delivery_methods(id) ON DELETE SET NULL,
  ADD INDEX idx_clients_client_status (client_status_id),
  ADD INDEX idx_clients_paperwork_status (paperwork_status_id),
  ADD INDEX idx_clients_insurance (insurance_type_id),
  ADD INDEX idx_clients_identifier_code (identifier_code),
  ADD INDEX idx_clients_service_day (service_day);

-- -----------------------------
-- Seed default keys (safe to run multiple times)
-- Note: seeded rows may be hidden unless backing files/config exist.
-- -----------------------------

-- Insurance defaults (per agency must be inserted by app logic; here we seed for all existing agencies)
INSERT INTO insurance_types (agency_id, insurance_key, label, is_active)
SELECT a.id, 'medicaid', 'Medicaid', TRUE FROM agencies a WHERE (a.organization_type = 'agency' OR a.organization_type IS NULL)
ON DUPLICATE KEY UPDATE label = VALUES(label);
INSERT INTO insurance_types (agency_id, insurance_key, label, is_active)
SELECT a.id, 'tricare', 'Tricare', TRUE FROM agencies a WHERE (a.organization_type = 'agency' OR a.organization_type IS NULL)
ON DUPLICATE KEY UPDATE label = VALUES(label);
INSERT INTO insurance_types (agency_id, insurance_key, label, is_active)
SELECT a.id, 'commercial_other', 'Commercial / Other', TRUE FROM agencies a WHERE (a.organization_type = 'agency' OR a.organization_type IS NULL)
ON DUPLICATE KEY UPDATE label = VALUES(label);
INSERT INTO insurance_types (agency_id, insurance_key, label, is_active)
SELECT a.id, 'unknown', 'Unknown', TRUE FROM agencies a WHERE (a.organization_type = 'agency' OR a.organization_type IS NULL)
ON DUPLICATE KEY UPDATE label = VALUES(label);
INSERT INTO insurance_types (agency_id, insurance_key, label, is_active)
SELECT a.id, 'none', 'None', TRUE FROM agencies a WHERE (a.organization_type = 'agency' OR a.organization_type IS NULL)
ON DUPLICATE KEY UPDATE label = VALUES(label);
INSERT INTO insurance_types (agency_id, insurance_key, label, is_active)
SELECT a.id, 'self_pay', 'Self Pay', TRUE FROM agencies a WHERE (a.organization_type = 'agency' OR a.organization_type IS NULL)
ON DUPLICATE KEY UPDATE label = VALUES(label);

-- Client Status defaults
INSERT INTO client_statuses (agency_id, status_key, label, description, is_active)
SELECT a.id, 'current', 'Current', 'Client is actively receiving services.', TRUE FROM agencies a WHERE (a.organization_type = 'agency' OR a.organization_type IS NULL)
ON DUPLICATE KEY UPDATE label = VALUES(label);
INSERT INTO client_statuses (agency_id, status_key, label, description, is_active)
SELECT a.id, 'pending', 'Pending', 'Client is pending assignment and/or paperwork.', TRUE FROM agencies a WHERE (a.organization_type = 'agency' OR a.organization_type IS NULL)
ON DUPLICATE KEY UPDATE label = VALUES(label);
INSERT INTO client_statuses (agency_id, status_key, label, description, is_active)
SELECT a.id, 'terminated', 'Terminated', 'Services ended; no longer active.', TRUE FROM agencies a WHERE (a.organization_type = 'agency' OR a.organization_type IS NULL)
ON DUPLICATE KEY UPDATE label = VALUES(label);
INSERT INTO client_statuses (agency_id, status_key, label, description, is_active)
SELECT a.id, 'inactive', 'Inactive', 'Not active currently; may resume later.', TRUE FROM agencies a WHERE (a.organization_type = 'agency' OR a.organization_type IS NULL)
ON DUPLICATE KEY UPDATE label = VALUES(label);
INSERT INTO client_statuses (agency_id, status_key, label, description, is_active)
SELECT a.id, 'waitlist', 'Waitlist', 'Waiting for an opening/availability.', TRUE FROM agencies a WHERE (a.organization_type = 'agency' OR a.organization_type IS NULL)
ON DUPLICATE KEY UPDATE label = VALUES(label);
INSERT INTO client_statuses (agency_id, status_key, label, description, is_active)
SELECT a.id, 'screener', 'Screener', 'In screening stage; not yet onboarded.', TRUE FROM agencies a WHERE (a.organization_type = 'agency' OR a.organization_type IS NULL)
ON DUPLICATE KEY UPDATE label = VALUES(label);
INSERT INTO client_statuses (agency_id, status_key, label, description, is_active)
SELECT a.id, 'packet', 'Packet', 'Packet sent/awaiting completion.', TRUE FROM agencies a WHERE (a.organization_type = 'agency' OR a.organization_type IS NULL)
ON DUPLICATE KEY UPDATE label = VALUES(label);

-- Paperwork Status defaults
INSERT INTO paperwork_statuses (agency_id, status_key, label, description, is_active)
SELECT a.id, 'completed', 'Completed', 'All required paperwork is complete.', TRUE FROM agencies a WHERE (a.organization_type = 'agency' OR a.organization_type IS NULL)
ON DUPLICATE KEY UPDATE label = VALUES(label);
INSERT INTO paperwork_statuses (agency_id, status_key, label, description, is_active)
SELECT a.id, 're_auth', 'Re-Auth', 'Re-authorization required.', TRUE FROM agencies a WHERE (a.organization_type = 'agency' OR a.organization_type IS NULL)
ON DUPLICATE KEY UPDATE label = VALUES(label);
INSERT INTO paperwork_statuses (agency_id, status_key, label, description, is_active)
SELECT a.id, 'new_insurance', 'New Insurance', 'Insurance changed; new docs needed.', TRUE FROM agencies a WHERE (a.organization_type = 'agency' OR a.organization_type IS NULL)
ON DUPLICATE KEY UPDATE label = VALUES(label);
INSERT INTO paperwork_statuses (agency_id, status_key, label, description, is_active)
SELECT a.id, 'insurance_payment_auth', 'Insurance / Payment Auth', 'Authorization needed for insurance/payment.', TRUE FROM agencies a WHERE (a.organization_type = 'agency' OR a.organization_type IS NULL)
ON DUPLICATE KEY UPDATE label = VALUES(label);
INSERT INTO paperwork_statuses (agency_id, status_key, label, description, is_active)
SELECT a.id, 'emailed_packet', 'Emailed Packet', 'Packet emailed; awaiting return.', TRUE FROM agencies a WHERE (a.organization_type = 'agency' OR a.organization_type IS NULL)
ON DUPLICATE KEY UPDATE label = VALUES(label);
INSERT INTO paperwork_statuses (agency_id, status_key, label, description, is_active)
SELECT a.id, 'roi', 'ROI', 'Release of Information required.', TRUE FROM agencies a WHERE (a.organization_type = 'agency' OR a.organization_type IS NULL)
ON DUPLICATE KEY UPDATE label = VALUES(label);
INSERT INTO paperwork_statuses (agency_id, status_key, label, description, is_active)
SELECT a.id, 'renewal', 'Renewal', 'Renewal paperwork required.', TRUE FROM agencies a WHERE (a.organization_type = 'agency' OR a.organization_type IS NULL)
ON DUPLICATE KEY UPDATE label = VALUES(label);
INSERT INTO paperwork_statuses (agency_id, status_key, label, description, is_active)
SELECT a.id, 'new_docs', 'New Docs', 'New documents required.', TRUE FROM agencies a WHERE (a.organization_type = 'agency' OR a.organization_type IS NULL)
ON DUPLICATE KEY UPDATE label = VALUES(label);
INSERT INTO paperwork_statuses (agency_id, status_key, label, description, is_active)
SELECT a.id, 'disclosure_consent', 'Disclosure and Consent', 'Disclosure/consent forms required.', TRUE FROM agencies a WHERE (a.organization_type = 'agency' OR a.organization_type IS NULL)
ON DUPLICATE KEY UPDATE label = VALUES(label);
INSERT INTO paperwork_statuses (agency_id, status_key, label, description, is_active)
SELECT a.id, 'balance', 'BALANCE', 'Balance due; requires follow-up.', TRUE FROM agencies a WHERE (a.organization_type = 'agency' OR a.organization_type IS NULL)
ON DUPLICATE KEY UPDATE label = VALUES(label);

-- Provider credential defaults
INSERT INTO provider_credentials (agency_id, credential_key, label, is_active)
SELECT a.id, 'bachelors', 'Bachelors', TRUE FROM agencies a WHERE (a.organization_type = 'agency' OR a.organization_type IS NULL)
ON DUPLICATE KEY UPDATE label = VALUES(label);
INSERT INTO provider_credentials (agency_id, credential_key, label, is_active)
SELECT a.id, 'intern', 'Intern', TRUE FROM agencies a WHERE (a.organization_type = 'agency' OR a.organization_type IS NULL)
ON DUPLICATE KEY UPDATE label = VALUES(label);
INSERT INTO provider_credentials (agency_id, credential_key, label, is_active)
SELECT a.id, 'lpc', 'LPC', TRUE FROM agencies a WHERE (a.organization_type = 'agency' OR a.organization_type IS NULL)
ON DUPLICATE KEY UPDATE label = VALUES(label);
INSERT INTO provider_credentials (agency_id, credential_key, label, is_active)
SELECT a.id, 'lpcc', 'LPCC', TRUE FROM agencies a WHERE (a.organization_type = 'agency' OR a.organization_type IS NULL)
ON DUPLICATE KEY UPDATE label = VALUES(label);
INSERT INTO provider_credentials (agency_id, credential_key, label, is_active)
SELECT a.id, 'mft', 'MFT', TRUE FROM agencies a WHERE (a.organization_type = 'agency' OR a.organization_type IS NULL)
ON DUPLICATE KEY UPDATE label = VALUES(label);
INSERT INTO provider_credentials (agency_id, credential_key, label, is_active)
SELECT a.id, 'mftc', 'MFTC', TRUE FROM agencies a WHERE (a.organization_type = 'agency' OR a.organization_type IS NULL)
ON DUPLICATE KEY UPDATE label = VALUES(label);
INSERT INTO provider_credentials (agency_id, credential_key, label, is_active)
SELECT a.id, 'peer_professional', 'Peer Professional', TRUE FROM agencies a WHERE (a.organization_type = 'agency' OR a.organization_type IS NULL)
ON DUPLICATE KEY UPDATE label = VALUES(label);
INSERT INTO provider_credentials (agency_id, credential_key, label, is_active)
SELECT a.id, 'swc', 'SWC', TRUE FROM agencies a WHERE (a.organization_type = 'agency' OR a.organization_type IS NULL)
ON DUPLICATE KEY UPDATE label = VALUES(label);
INSERT INTO provider_credentials (agency_id, credential_key, label, is_active)
SELECT a.id, 'lcsw', 'LCSW', TRUE FROM agencies a WHERE (a.organization_type = 'agency' OR a.organization_type IS NULL)
ON DUPLICATE KEY UPDATE label = VALUES(label);
INSERT INTO provider_credentials (agency_id, credential_key, label, is_active)
SELECT a.id, 'lmft', 'LMFT', TRUE FROM agencies a WHERE (a.organization_type = 'agency' OR a.organization_type IS NULL)
ON DUPLICATE KEY UPDATE label = VALUES(label);
INSERT INTO provider_credentials (agency_id, credential_key, label, is_active)
SELECT a.id, 'unknown', 'Unknown', TRUE FROM agencies a WHERE (a.organization_type = 'agency' OR a.organization_type IS NULL)
ON DUPLICATE KEY UPDATE label = VALUES(label);

-- Paperwork delivery defaults for all schools
INSERT INTO paperwork_delivery_methods (school_organization_id, method_key, label, is_active)
SELECT s.id, 'uploaded', 'Uploaded', TRUE FROM agencies s WHERE s.organization_type = 'school'
ON DUPLICATE KEY UPDATE label = VALUES(label);
INSERT INTO paperwork_delivery_methods (school_organization_id, method_key, label, is_active)
SELECT s.id, 'school_emailed', 'School Emailed', TRUE FROM agencies s WHERE s.organization_type = 'school'
ON DUPLICATE KEY UPDATE label = VALUES(label);
INSERT INTO paperwork_delivery_methods (school_organization_id, method_key, label, is_active)
SELECT s.id, 'set_home', 'Set Home', TRUE FROM agencies s WHERE s.organization_type = 'school'
ON DUPLICATE KEY UPDATE label = VALUES(label);
INSERT INTO paperwork_delivery_methods (school_organization_id, method_key, label, is_active)
SELECT s.id, 'unknown', 'Unknown', TRUE FROM agencies s WHERE s.organization_type = 'school'
ON DUPLICATE KEY UPDATE label = VALUES(label);

