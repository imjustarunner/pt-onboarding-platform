-- Migration 836: add pasted activity/session notes text to skill_builders_event_sessions
ALTER TABLE skill_builders_event_sessions
  ADD COLUMN curriculum_notes_text MEDIUMTEXT NULL DEFAULT NULL
  COMMENT 'Staff-pasted activity/session notes for AI clinical note generation';
