/*
Phase 1 foundation for in-app supervision attendance tracking and compensation flags.

Adds:
- per-user compensable supervision flag (profile-level, per agency)
- session typing and Google Meet identifiers on supervision sessions
- attendee roster table
- raw attendance event ledger
- attendance rollup table for payroll/audit use
*/

ALTER TABLE user_agencies
  ADD COLUMN supervision_is_compensable TINYINT(1) NOT NULL DEFAULT 0 AFTER supervision_is_prelicensed;

CREATE INDEX idx_user_agencies_supervision_compensable
  ON user_agencies (agency_id, supervision_is_compensable, user_id);

ALTER TABLE supervision_sessions
  ADD COLUMN session_type VARCHAR(32) NOT NULL DEFAULT 'individual' AFTER supervisee_user_id,
  ADD COLUMN meeting_provider VARCHAR(32) NULL AFTER session_type,
  ADD COLUMN meet_space_name VARCHAR(255) NULL AFTER google_meet_link,
  ADD COLUMN meet_conference_record_name VARCHAR(255) NULL AFTER meet_space_name,
  ADD COLUMN external_meeting_code VARCHAR(128) NULL AFTER meet_conference_record_name;

CREATE INDEX idx_supervision_sessions_type_window
  ON supervision_sessions (agency_id, session_type, start_at);

CREATE TABLE IF NOT EXISTS supervision_session_attendees (
  id INT AUTO_INCREMENT PRIMARY KEY,
  session_id INT NOT NULL,
  user_id INT NOT NULL,
  participant_role VARCHAR(32) NOT NULL,   /* supervisor | supervisee */
  is_compensable_snapshot TINYINT(1) NOT NULL DEFAULT 0,
  invited_at DATETIME NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'INVITED', /* INVITED | JOINED | LEFT | NO_SHOW */
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY uniq_supervision_session_attendee (session_id, user_id),
  INDEX idx_supervision_session_attendees_user (user_id, session_id),
  INDEX idx_supervision_session_attendees_session_role (session_id, participant_role),

  CONSTRAINT fk_supervision_session_attendees_session
    FOREIGN KEY (session_id) REFERENCES supervision_sessions(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_supervision_session_attendees_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS supervision_session_attendance_events (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  session_id INT NOT NULL,
  attendee_id INT NULL,
  user_id INT NULL,
  participant_session_key VARCHAR(255) NOT NULL, /* provider participantSession resource id */
  event_type VARCHAR(32) NOT NULL,               /* joined | left */
  event_at DATETIME NOT NULL,
  raw_payload_json JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  UNIQUE KEY uniq_supervision_attendance_event (session_id, participant_session_key, event_type, event_at),
  INDEX idx_supervision_attendance_events_session_time (session_id, event_at),
  INDEX idx_supervision_attendance_events_user_time (user_id, event_at),

  CONSTRAINT fk_supervision_attendance_events_session
    FOREIGN KEY (session_id) REFERENCES supervision_sessions(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_supervision_attendance_events_attendee
    FOREIGN KEY (attendee_id) REFERENCES supervision_session_attendees(id)
    ON DELETE SET NULL,
  CONSTRAINT fk_supervision_attendance_events_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS supervision_session_attendance_rollups (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  session_id INT NOT NULL,
  user_id INT NOT NULL,
  first_joined_at DATETIME NULL,
  last_left_at DATETIME NULL,
  total_seconds INT NOT NULL DEFAULT 0,
  segment_count INT NOT NULL DEFAULT 0,
  is_finalized TINYINT(1) NOT NULL DEFAULT 0,
  source_version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY uniq_supervision_attendance_rollup (session_id, user_id),
  INDEX idx_supervision_attendance_rollups_user (user_id, updated_at),
  INDEX idx_supervision_attendance_rollups_session (session_id, updated_at),

  CONSTRAINT fk_supervision_attendance_rollups_session
    FOREIGN KEY (session_id) REFERENCES supervision_sessions(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_supervision_attendance_rollups_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
