-- Migration: Add encryption + categories to client_notes
-- Description: Supports internal client chat with server-side encryption at rest and message categorization.

-- Allow NULL plaintext message (new writes will store encrypted fields)
ALTER TABLE client_notes
  MODIFY COLUMN message TEXT NULL;

ALTER TABLE client_notes
  ADD COLUMN category VARCHAR(32) DEFAULT 'general' AFTER author_id,
  ADD COLUMN message_ciphertext MEDIUMTEXT NULL AFTER message,
  ADD COLUMN message_iv VARCHAR(64) NULL AFTER message_ciphertext,
  ADD COLUMN message_auth_tag VARCHAR(64) NULL AFTER message_iv,
  ADD COLUMN encryption_key_id VARCHAR(64) NULL AFTER message_auth_tag;

CREATE INDEX idx_client_notes_category ON client_notes (category);

