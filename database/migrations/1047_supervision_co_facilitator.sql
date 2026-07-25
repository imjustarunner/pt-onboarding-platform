-- Migration 1047: optional co-facilitator for group supervision sessions
ALTER TABLE supervision_sessions
  ADD COLUMN co_facilitator_user_id INT NULL DEFAULT NULL
  COMMENT 'Optional second group supervisor / co-facilitator'
  AFTER supervisor_user_id;

ALTER TABLE supervision_sessions
  ADD CONSTRAINT fk_supervision_sessions_co_facilitator
    FOREIGN KEY (co_facilitator_user_id) REFERENCES users(id)
    ON DELETE SET NULL;

CREATE INDEX idx_supervision_sessions_co_facilitator
  ON supervision_sessions (co_facilitator_user_id, start_at);
