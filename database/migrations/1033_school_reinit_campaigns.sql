-- Migration 1033: Agency-level school year re-init campaign (enable + push)

CREATE TABLE IF NOT EXISTS school_reinit_campaigns (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  school_year VARCHAR(16) NOT NULL COMMENT 'e.g. 2026-27',
  status ENUM('draft', 'enabled', 'pushed') NOT NULL DEFAULT 'draft',
  enabled_at DATETIME NULL DEFAULT NULL,
  enabled_by_user_id INT NULL DEFAULT NULL,
  pushed_at DATETIME NULL DEFAULT NULL,
  pushed_by_user_id INT NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_school_reinit_campaign (agency_id, school_year),
  CONSTRAINT fk_school_reinit_campaign_agency
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_school_reinit_campaign_enabled_by
    FOREIGN KEY (enabled_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_school_reinit_campaign_pushed_by
    FOREIGN KEY (pushed_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
