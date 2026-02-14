-- Migration: Company events with audience targeting

CREATE TABLE IF NOT EXISTS company_events (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  created_by_user_id INT NOT NULL,
  updated_by_user_id INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NULL,
  event_type VARCHAR(64) NULL,
  splash_content TEXT NULL,
  starts_at DATETIME NOT NULL,
  ends_at DATETIME NOT NULL,
  timezone VARCHAR(64) NULL,
  recurrence_json JSON NULL,
  is_active BOOLEAN DEFAULT TRUE,
  rsvp_mode VARCHAR(32) NULL,
  voting_config_json JSON NULL,
  voting_closed_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_company_events_agency_time (agency_id, starts_at, ends_at),
  INDEX idx_company_events_agency_active (agency_id, is_active, starts_at),
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS company_event_audiences (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_event_id INT NOT NULL,
  audience_type ENUM('user','group') NOT NULL,
  target_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_company_event_audience (company_event_id, audience_type, target_id),
  INDEX idx_company_event_audience_type_target (audience_type, target_id),
  FOREIGN KEY (company_event_id) REFERENCES company_events(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
