-- Migration 1045: supervision session invite scope (open vs invited supervisees)
ALTER TABLE supervision_sessions
  ADD COLUMN invite_scope VARCHAR(32) NOT NULL DEFAULT 'invited_only'
  COMMENT 'invited_only | open_to_all | open_and_invited';

CREATE INDEX idx_supervision_sessions_invite_scope
  ON supervision_sessions (agency_id, invite_scope, start_at);
