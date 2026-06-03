/*
Migration 843: Provider tutoring profiles.

Stores tutor-specific public profile data: subjects, grade levels, rate, and bio.
Subject expertise is stored here (not on the clinical provider_search_index)
because tutoring is a separate service domain.
*/

CREATE TABLE provider_tutoring_profiles (
  id INT NOT NULL AUTO_INCREMENT,
  user_id INT NOT NULL,
  agency_id INT NOT NULL,
  subject_areas_json JSON NULL COMMENT 'Array of subject area strings e.g. ["Math","Reading","SAT/ACT"]',
  grade_levels_json JSON NULL COMMENT 'Array of grade level strings e.g. ["K-2","3-5","6-8","9-12"]',
  session_rate_cents INT NULL COMMENT 'Per-session rate in cents; NULL means contact office',
  session_rate_note VARCHAR(255) NULL COMMENT 'Optional override text for rate display',
  bio TEXT NULL COMMENT 'Public-facing tutor bio',
  accepting_new_students TINYINT NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_provider_tutoring_profile (user_id, agency_id),
  KEY idx_provider_tutoring_profiles_agency (agency_id),
  CONSTRAINT fk_provider_tutoring_profiles_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_provider_tutoring_profiles_agency
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
