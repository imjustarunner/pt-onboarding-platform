-- Migration 1316: Staff client comfort preferences (Track B)
-- Hiring/onboarding comfort matrix for tutoring / therapy+tutoring staff matching.

CREATE TABLE staff_client_comfort_preferences (
  id INT NOT NULL AUTO_INCREMENT,
  agency_id INT NOT NULL,
  user_id INT NOT NULL,
  hiring_profile_id INT NULL COMMENT 'Set when captured during hiring before user exists',
  academic_subjects_json JSON NULL COMMENT 'Checklist of academic subject keys',
  emotional_behavioral_json JSON NULL COMMENT 'Emotional & behavioral comfort checklist',
  age_ranges_json JSON NULL COMMENT 'e.g. ["3-5","6-8","9-11","12-14","15-17","18+"]',
  grade_levels_json JSON NULL COMMENT 'e.g. ["pre_k_k","1_2","3_5","6_8","9_12"]',
  service_types_json JSON NULL COMMENT 'tutoring|therapy_tutoring|group_sessions',
  assessment_tools_json JSON NULL COMMENT 'Internal/licensed assessment keys staff can administer',
  additional_notes TEXT NULL,
  completed_at DATETIME NULL,
  created_by_user_id INT NULL,
  updated_by_user_id INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_staff_comfort_user_agency (user_id, agency_id),
  KEY idx_staff_comfort_agency (agency_id),
  KEY idx_staff_comfort_hiring (hiring_profile_id),
  CONSTRAINT fk_staff_comfort_agency
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_staff_comfort_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE staff_comfort_preference_drafts (
  id INT NOT NULL AUTO_INCREMENT,
  agency_id INT NOT NULL,
  hiring_profile_id INT NOT NULL,
  academic_subjects_json JSON NULL,
  emotional_behavioral_json JSON NULL,
  age_ranges_json JSON NULL,
  grade_levels_json JSON NULL,
  service_types_json JSON NULL,
  assessment_tools_json JSON NULL,
  additional_notes TEXT NULL,
  created_by_user_id INT NULL,
  updated_by_user_id INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_staff_comfort_draft_hiring (hiring_profile_id),
  KEY idx_staff_comfort_draft_agency (agency_id),
  CONSTRAINT fk_staff_comfort_draft_agency
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
