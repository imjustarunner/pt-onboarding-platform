-- Program event materialized sessions (for non-skills_group company events).
-- One row per recurrence occurrence so portals can show/edit each date.

CREATE TABLE IF NOT EXISTS company_event_session_dates (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_event_id INT NOT NULL,
  session_date DATE NOT NULL,
  starts_at DATETIME NOT NULL,
  ends_at DATETIME NOT NULL,
  timezone VARCHAR(64) NOT NULL DEFAULT 'UTC',
  join_url VARCHAR(1024) NULL DEFAULT NULL,
  modality VARCHAR(32) NULL DEFAULT NULL,
  location_label VARCHAR(255) NULL DEFAULT NULL,
  location_address VARCHAR(512) NULL DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_company_event_session_date_start (company_event_id, session_date, starts_at),
  INDEX idx_company_event_session_dates_event_date (company_event_id, session_date),
  FOREIGN KEY (company_event_id) REFERENCES company_events(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
