-- Materialized program sessions: one row per (skills_group_meeting × calendar day) within the group's date range.
-- Drives attendance/kiosk targeting and future per-session assignments.

CREATE TABLE IF NOT EXISTS skill_builders_event_sessions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_event_id INT NOT NULL,
  skills_group_id INT NOT NULL,
  skills_group_meeting_id INT NOT NULL,
  session_date DATE NOT NULL COMMENT 'Program calendar date (matches skills_groups.start/end semantics)',
  starts_at DATETIME NOT NULL,
  ends_at DATETIME NOT NULL,
  timezone VARCHAR(64) NOT NULL DEFAULT 'America/New_York',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_sb_event_session_meeting_day (skills_group_meeting_id, session_date),
  INDEX idx_sb_sessions_event_date (company_event_id, session_date),
  INDEX idx_sb_sessions_group_date (skills_group_id, session_date),
  FOREIGN KEY (company_event_id) REFERENCES company_events(id) ON DELETE CASCADE,
  FOREIGN KEY (skills_group_id) REFERENCES skills_groups(id) ON DELETE CASCADE,
  FOREIGN KEY (skills_group_meeting_id) REFERENCES skills_group_meetings(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE skill_builders_event_kiosk_punches
  ADD COLUMN session_id INT NULL DEFAULT NULL
    COMMENT 'skill_builders_event_sessions.id when punch is tied to a scheduled occurrence'
    AFTER company_event_id,
  ADD INDEX idx_sb_kiosk_punches_session (session_id),
  ADD CONSTRAINT fk_sb_kiosk_punches_session
    FOREIGN KEY (session_id) REFERENCES skill_builders_event_sessions(id) ON DELETE SET NULL;
