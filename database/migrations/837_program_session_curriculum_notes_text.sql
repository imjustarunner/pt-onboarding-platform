-- Migration 837: add pasted activity/session notes text to company_event_session_dates (program events)
ALTER TABLE company_event_session_dates
  ADD COLUMN curriculum_notes_text MEDIUMTEXT NULL DEFAULT NULL
  COMMENT 'Staff-pasted activity/session notes for AI clinical note generation (program event sessions)';
