-- Migration 1015: track client session phase for Idle/Away (timedown vs active vs away)
ALTER TABLE user_presence
  ADD COLUMN session_phase VARCHAR(32) NULL DEFAULT NULL
  COMMENT 'active | timedown | away — client inactivity overlay phase';
