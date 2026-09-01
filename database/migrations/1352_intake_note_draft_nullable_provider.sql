-- Migration 1352: allow packet-bootstrap intake drafts without an assigned clinician yet
ALTER TABLE client_intake_note_drafts
  MODIFY COLUMN provider_user_id INT NULL
  COMMENT 'Assigned clinician when known; NULL until a provider is assigned after packet bootstrap';
