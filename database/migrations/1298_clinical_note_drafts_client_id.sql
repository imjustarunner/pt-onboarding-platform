-- Migration 1298: Attach clinical note drafts to a real client (id only; no name on server key)
ALTER TABLE clinical_note_drafts
  ADD COLUMN client_id INT NULL DEFAULT NULL
  COMMENT 'Optional linked client id; never send client name as identity key'
  AFTER agency_id;

ALTER TABLE clinical_note_drafts
  ADD INDEX idx_clinical_note_drafts_client (client_id);
