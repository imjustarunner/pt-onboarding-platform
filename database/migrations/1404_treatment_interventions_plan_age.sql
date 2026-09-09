-- Migration 1404: intervention catalogs, treatment-plan max age, office↔school links stay on service locations

ALTER TABLE agencies
  ADD COLUMN treatment_plan_max_age_days INT NOT NULL DEFAULT 90
  COMMENT 'Progress notes require an active treatment plan no older than this many days (clinical counseling default 90)';

CREATE TABLE IF NOT EXISTS clinical_intervention_catalog (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  user_id INT NOT NULL DEFAULT 0
    COMMENT '0 = agency default; otherwise this provider''s extra options',
  name VARCHAR(160)
    CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_by_user_id INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_intervention_scope_name (agency_id, user_id, name),
  KEY idx_intervention_agency_user (agency_id, user_id, is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
