-- Migration 1001: at-rest encryption columns for support tickets (same AES-GCM pattern as chat_messages)
ALTER TABLE support_ticket_messages
  ADD COLUMN body_ciphertext MEDIUMTEXT NULL AFTER body,
  ADD COLUMN body_iv VARCHAR(64) NULL AFTER body_ciphertext,
  ADD COLUMN body_auth_tag VARCHAR(64) NULL AFTER body_iv,
  ADD COLUMN encryption_key_id VARCHAR(64) NULL AFTER body_auth_tag;

ALTER TABLE support_ticket_messages
  MODIFY COLUMN body TEXT NULL;

ALTER TABLE support_tickets
  ADD COLUMN question_ciphertext MEDIUMTEXT NULL AFTER question,
  ADD COLUMN question_iv VARCHAR(64) NULL AFTER question_ciphertext,
  ADD COLUMN question_auth_tag VARCHAR(64) NULL AFTER question_iv,
  ADD COLUMN question_encryption_key_id VARCHAR(64) NULL AFTER question_auth_tag,
  ADD COLUMN answer_ciphertext MEDIUMTEXT NULL AFTER answer,
  ADD COLUMN answer_iv VARCHAR(64) NULL AFTER answer_ciphertext,
  ADD COLUMN answer_auth_tag VARCHAR(64) NULL AFTER answer_iv,
  ADD COLUMN answer_encryption_key_id VARCHAR(64) NULL AFTER answer_auth_tag;

ALTER TABLE support_tickets
  MODIFY COLUMN question TEXT NULL,
  MODIFY COLUMN answer TEXT NULL;
