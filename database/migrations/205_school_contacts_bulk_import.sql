-- Migration: School contacts bulk import foundation
-- Description:
-- - Extend school_profiles with contact + ITSCO + scheduling metadata
-- - Add school_contacts table for additional contacts (structured, de-duplicated)
-- - Add optional job_type/meta_json fields to bulk_import_jobs to reuse job UI pattern across importers

-- ----------------------------------------
-- Bulk import jobs: add job_type + meta_json
-- ----------------------------------------
ALTER TABLE bulk_import_jobs
  ADD COLUMN job_type VARCHAR(64) NULL COMMENT 'Importer identifier (e.g., bulk_client_upload, bulk_school_upload)' AFTER file_name;

ALTER TABLE bulk_import_jobs
  ADD COLUMN meta_json JSON NULL COMMENT 'Arbitrary metadata for the import job' AFTER job_type;

CREATE INDEX idx_bulk_job_job_type ON bulk_import_jobs(job_type);

-- ----------------------------------------
-- School profiles: extend school metadata
-- ----------------------------------------
ALTER TABLE school_profiles
  ADD COLUMN school_number VARCHAR(64) NULL AFTER district_name;

ALTER TABLE school_profiles
  ADD COLUMN itsco_email VARCHAR(255) NULL AFTER school_number;

ALTER TABLE school_profiles
  ADD COLUMN school_days_times TEXT NULL AFTER itsco_email;

ALTER TABLE school_profiles
  ADD COLUMN school_address TEXT NULL AFTER school_days_times;

ALTER TABLE school_profiles
  ADD COLUMN location_label VARCHAR(255) NULL AFTER school_address;

ALTER TABLE school_profiles
  ADD COLUMN primary_contact_name VARCHAR(255) NULL AFTER location_label;

ALTER TABLE school_profiles
  ADD COLUMN primary_contact_email VARCHAR(255) NULL AFTER primary_contact_name;

ALTER TABLE school_profiles
  ADD COLUMN primary_contact_role VARCHAR(255) NULL AFTER primary_contact_email;

CREATE INDEX idx_school_profiles_school_number ON school_profiles(school_number);
CREATE INDEX idx_school_profiles_itsco_email ON school_profiles(itsco_email);

-- ----------------------------------------
-- School contacts: structured contacts list
-- ----------------------------------------
CREATE TABLE IF NOT EXISTS school_contacts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  school_organization_id INT NOT NULL COMMENT 'agencies.id where organization_type = school',
  full_name VARCHAR(255) NULL,
  email VARCHAR(255) NULL,
  role_title VARCHAR(255) NULL,
  notes VARCHAR(500) NULL,
  raw_source_text TEXT NULL COMMENT 'Original unparsed cell text for traceability',
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (school_organization_id) REFERENCES agencies(id) ON DELETE CASCADE,
  UNIQUE KEY uniq_school_contact_email (school_organization_id, email),
  INDEX idx_school_contacts_school (school_organization_id),
  INDEX idx_school_contacts_email (email),
  INDEX idx_school_contacts_primary (school_organization_id, is_primary)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

