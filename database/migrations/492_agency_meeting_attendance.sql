-- Agency meeting attendance: link TEAM_MEETING events to Meet attendance for payroll.
-- 1) Store Meet link and attendees when creating TEAM_MEETING
-- 2) Sync attendance from Google Meet API
-- 3) Payroll uses rollups for MEETING pay

-- Add Meet link to provider_schedule_events (for TEAM_MEETING)
ALTER TABLE provider_schedule_events
  ADD COLUMN google_meet_link VARCHAR(1024) NULL AFTER google_html_link;

-- Invited attendees per event (TEAM_MEETING only)
CREATE TABLE IF NOT EXISTS provider_schedule_event_attendees (
  id INT NOT NULL AUTO_INCREMENT,
  event_id INT NOT NULL,
  user_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_pse_attendee (event_id, user_id),
  KEY idx_pse_attendees_event (event_id),
  KEY idx_pse_attendees_user (user_id),
  CONSTRAINT fk_pse_attendees_event FOREIGN KEY (event_id) REFERENCES provider_schedule_events(id) ON DELETE CASCADE,
  CONSTRAINT fk_pse_attendees_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Synced attendance from Google Meet (participant join/leave)
CREATE TABLE IF NOT EXISTS agency_meeting_attendance_rollups (
  id BIGINT NOT NULL AUTO_INCREMENT,
  event_id INT NOT NULL,
  user_id INT NOT NULL,
  total_seconds INT NOT NULL DEFAULT 0,
  participant_email VARCHAR(255) NULL,
  synced_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_meeting_attendance (event_id, user_id),
  KEY idx_meeting_attendance_event (event_id),
  KEY idx_meeting_attendance_user (user_id),
  KEY idx_meeting_attendance_synced (synced_at),
  CONSTRAINT fk_meeting_attendance_event FOREIGN KEY (event_id) REFERENCES provider_schedule_events(id) ON DELETE CASCADE,
  CONSTRAINT fk_meeting_attendance_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
