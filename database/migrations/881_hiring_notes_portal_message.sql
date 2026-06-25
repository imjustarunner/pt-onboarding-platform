-- Migration 881: flag hiring notes visible in candidate pre-hire portal chat
ALTER TABLE hiring_notes
  ADD COLUMN is_portal_message TINYINT(1) NOT NULL DEFAULT 0
  COMMENT 'When 1, visible in the candidate pre-hire portal chat thread';
