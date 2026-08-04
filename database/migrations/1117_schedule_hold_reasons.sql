-- Migration 1117: Agency + user schedule hold reason catalogs
CREATE TABLE IF NOT EXISTS agency_schedule_hold_reasons (
  id INT PRIMARY KEY AUTO_INCREMENT,
  agency_id INT NOT NULL,
  code VARCHAR(64) NOT NULL,
  label VARCHAR(120) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_by_user_id INT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_agency_hold_reason_code (agency_id, code),
  INDEX idx_agency_hold_reasons (agency_id, is_active),
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS user_schedule_hold_reason_prefs (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  reason_code VARCHAR(64) NOT NULL,
  source ENUM('platform', 'agency', 'custom') NOT NULL DEFAULT 'platform',
  agency_id INT NULL,
  is_hidden TINYINT(1) NOT NULL DEFAULT 0,
  custom_label VARCHAR(120) NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_hold_reason (user_id, reason_code, source),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
);

ALTER TABLE provider_schedule_events
  ADD COLUMN focus_session_enabled TINYINT(1) NOT NULL DEFAULT 0
  COMMENT 'When 1, user can join Focus Session from this schedule hold'
  AFTER is_private;
