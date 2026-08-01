-- Migration 1104: persist when a supervision live session was ended by the facilitator
ALTER TABLE supervision_sessions
  ADD COLUMN live_ended_at DATETIME NULL DEFAULT NULL
  COMMENT 'When the facilitator ended the live video session for everyone; blocks rejoin';

CREATE INDEX idx_supervision_sessions_live_ended_at
  ON supervision_sessions (live_ended_at);
