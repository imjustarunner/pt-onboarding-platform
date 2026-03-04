/*
Finalize and reschedule lifecycle metadata for supervision sessions.
*/

ALTER TABLE supervision_sessions
  ADD COLUMN finalized_at DATETIME NULL AFTER status,
  ADD COLUMN finalized_by_user_id INT NULL AFTER finalized_at,
  ADD COLUMN finalize_source VARCHAR(64) NULL AFTER finalized_by_user_id,
  ADD COLUMN final_total_seconds INT NULL AFTER finalize_source,
  ADD COLUMN superseded_by_session_id INT NULL AFTER final_total_seconds;

CREATE INDEX idx_supervision_sessions_finalized_at
  ON supervision_sessions (finalized_at);

CREATE INDEX idx_supervision_sessions_status_end
  ON supervision_sessions (status, end_at);

