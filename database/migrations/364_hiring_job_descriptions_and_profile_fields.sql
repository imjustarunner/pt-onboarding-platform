-- Migration: Hiring job descriptions + profile fields
-- Description:
--   - Adds agency-scoped job descriptions that can be selected for applicants
--   - Adds optional job_description_id + cover_letter_text to hiring_profiles
--
-- Notes:
--   This migration is written to be idempotent because some environments may
--   have applied an earlier copy of this migration under a different filename.

CREATE TABLE IF NOT EXISTS hiring_job_descriptions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  description_text LONGTEXT NULL,
  storage_path VARCHAR(512) NULL,
  original_name VARCHAR(255) NULL,
  mime_type VARCHAR(128) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_by_user_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_hjd_agency_id (agency_id),
  INDEX idx_hjd_is_active (is_active),
  INDEX idx_hjd_created_at (created_at),
  CONSTRAINT fk_hjd_agency_id
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_hjd_created_by_user_id
    FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add job_description_id column if missing
SET @has_job_description_id := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'hiring_profiles'
    AND column_name = 'job_description_id'
);
SET @sql := IF(
  @has_job_description_id = 0,
  'ALTER TABLE hiring_profiles ADD COLUMN job_description_id INT NULL AFTER source',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add cover_letter_text column if missing
SET @has_cover_letter_text := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'hiring_profiles'
    AND column_name = 'cover_letter_text'
);
SET @sql := IF(
  @has_cover_letter_text = 0,
  'ALTER TABLE hiring_profiles ADD COLUMN cover_letter_text MEDIUMTEXT NULL AFTER job_description_id',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add index if missing
SET @has_idx := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'hiring_profiles'
    AND index_name = 'idx_hiring_profiles_job_description_id'
);
SET @sql := IF(
  @has_idx = 0,
  'ALTER TABLE hiring_profiles ADD INDEX idx_hiring_profiles_job_description_id (job_description_id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add FK constraint if missing
SET @has_fk := (
  SELECT COUNT(*)
  FROM information_schema.table_constraints
  WHERE constraint_schema = DATABASE()
    AND table_name = 'hiring_profiles'
    AND constraint_name = 'fk_hiring_profiles_job_description_id'
    AND constraint_type = 'FOREIGN KEY'
);
SET @sql := IF(
  @has_fk = 0,
  'ALTER TABLE hiring_profiles ADD CONSTRAINT fk_hiring_profiles_job_description_id FOREIGN KEY (job_description_id) REFERENCES hiring_job_descriptions(id) ON DELETE SET NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

