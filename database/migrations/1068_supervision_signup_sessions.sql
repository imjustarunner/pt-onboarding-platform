-- Migration 1068: tenant-wide signup-only group supervision sessions
ALTER TABLE supervision_sessions
  ADD COLUMN enrollment_mode VARCHAR(32) NOT NULL DEFAULT 'invited'
    COMMENT 'invited | open_join | signup_only' AFTER invite_audience_group_support,
  ADD COLUMN signup_closes_at DATETIME NULL
    COMMENT 'Last moment signups are accepted' AFTER enrollment_mode,
  ADD COLUMN auto_cancel_if_empty TINYINT(1) NOT NULL DEFAULT 0
    COMMENT 'Cancel when signup closes with zero signups' AFTER signup_closes_at,
  ADD COLUMN auto_cancelled_at DATETIME NULL AFTER auto_cancel_if_empty,
  ADD COLUMN cancel_reason VARCHAR(64) NULL AFTER auto_cancelled_at;

CREATE INDEX idx_supervision_sessions_signup_deadline
  ON supervision_sessions (agency_id, enrollment_mode, signup_closes_at, status);

ALTER TABLE supervision_session_attendees
  ADD COLUMN signed_up_at DATETIME NULL AFTER invited_at;
