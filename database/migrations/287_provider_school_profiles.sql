-- Migration: Provider school profiles (per provider per school)
-- Purpose: Store admin-editable school-specific provider info blurb for the portal.

CREATE TABLE IF NOT EXISTS provider_school_profiles (
  provider_user_id INT NOT NULL,
  school_organization_id INT NOT NULL,
  school_info_blurb TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (provider_user_id, school_organization_id),
  INDEX idx_provider_school_profiles_school (school_organization_id),
  INDEX idx_provider_school_profiles_provider (provider_user_id),
  CONSTRAINT fk_provider_school_profiles_provider FOREIGN KEY (provider_user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_provider_school_profiles_school FOREIGN KEY (school_organization_id) REFERENCES agencies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

