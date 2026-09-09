-- Migration 1402: tenant practice-category defaults + per-user grant/revoke effect
-- Defaults by audience (providers, supervisors, etc.) resolve with per-user overrides
-- the same way indirect Log Time duties use open defaults + add/remove.

CREATE TABLE IF NOT EXISTS agency_practice_category_defaults (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  agency_id INT NOT NULL,
  category VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL
    COMMENT 'mental_health | tutoring | coaching | consulting',
  audience_key VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL
    COMMENT 'providers | provider | provider_plus | supervisors | clinical_practice_assistant | all_clinical',
  is_enabled TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_agency_pc_default (agency_id, category, audience_key),
  KEY idx_agency_pc_defaults_agency (agency_id),
  CONSTRAINT fk_agency_pc_defaults_agency
    FOREIGN KEY (agency_id) REFERENCES agencies (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE user_agency_practice_categories
  ADD COLUMN effect VARCHAR(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'grant'
    COMMENT 'grant = explicit include; revoke = exclude even if audience default applies'
    AFTER is_active;
