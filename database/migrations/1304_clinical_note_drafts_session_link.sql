-- Migration 1304: link clinical note drafts to session/office event for connection icons
ALTER TABLE clinical_note_drafts
  ADD COLUMN office_event_id INT NULL DEFAULT NULL
    COMMENT 'Booked office event when note is session-linked',
  ADD COLUMN clinical_session_id INT NULL DEFAULT NULL
    COMMENT 'Clinical session when note is session-linked';

ALTER TABLE clinical_note_drafts
  ADD INDEX idx_clinical_note_drafts_office_event (office_event_id),
  ADD INDEX idx_clinical_note_drafts_clinical_session (clinical_session_id);
