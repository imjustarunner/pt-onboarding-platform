-- Twilio Video + transcript support for staff/agency meetings (TEAM_MEETING).
-- Mirrors supervision flow: room, artifacts, attendance from Twilio webhook.

-- Add Twilio room columns to provider_schedule_events
ALTER TABLE provider_schedule_events
  ADD COLUMN twilio_room_sid VARCHAR(34) NULL AFTER google_meet_link,
  ADD COLUMN twilio_room_unique_name VARCHAR(255) NULL AFTER twilio_room_sid;

CREATE INDEX idx_provider_schedule_events_twilio_room
  ON provider_schedule_events (twilio_room_sid);

-- Artifacts for transcript + AI summary (like supervision_session_artifacts)
CREATE TABLE IF NOT EXISTS provider_schedule_event_artifacts (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  event_id INT NOT NULL,
  tagged_at DATETIME NULL,
  transcript_url VARCHAR(2048) NULL,
  transcript_text LONGTEXT NULL,
  summary_text LONGTEXT NULL,
  summary_model VARCHAR(120) NULL,
  summary_generated_at DATETIME NULL,
  updated_by_user_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY uniq_pse_artifact_event (event_id),
  INDEX idx_pse_artifacts_updated (updated_at),

  CONSTRAINT fk_pse_artifacts_event
    FOREIGN KEY (event_id) REFERENCES provider_schedule_events(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_pse_artifacts_updated_by
    FOREIGN KEY (updated_by_user_id) REFERENCES users(id)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Raw join/leave events for Twilio attendance (used to compute rollups)
CREATE TABLE IF NOT EXISTS agency_meeting_twilio_attendance_events (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  event_id INT NOT NULL,
  user_id INT NOT NULL,
  event_type VARCHAR(16) NOT NULL,
  event_at DATETIME NOT NULL,
  participant_sid VARCHAR(64) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_amt_events_event_user (event_id, user_id),
  INDEX idx_amt_events_event_at (event_id, event_at),
  CONSTRAINT fk_amt_events_event
    FOREIGN KEY (event_id) REFERENCES provider_schedule_events(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_amt_events_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
