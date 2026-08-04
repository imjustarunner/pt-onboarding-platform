-- Migration 1132: record who ended a live supervision session
ALTER TABLE supervision_sessions
  ADD COLUMN live_ended_by_user_id INT NULL DEFAULT NULL
  COMMENT 'User who ended the live video room for everyone'
  AFTER live_ended_at;

CREATE INDEX idx_supervision_sessions_live_ended_by
  ON supervision_sessions (live_ended_by_user_id);

ALTER TABLE supervision_sessions
  ADD CONSTRAINT fk_supervision_live_ended_by
  FOREIGN KEY (live_ended_by_user_id) REFERENCES users(id)
  ON DELETE SET NULL;
