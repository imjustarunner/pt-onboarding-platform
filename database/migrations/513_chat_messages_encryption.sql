-- Migration: Add encryption support to platform chat_messages
-- When CLIENT_CHAT_ENCRYPTION_KEY_BASE64 is configured, new messages are encrypted at rest.
-- Existing messages remain in body (plaintext); new encrypted messages use body_ciphertext.

ALTER TABLE chat_messages
  ADD COLUMN body_ciphertext MEDIUMTEXT NULL AFTER body,
  ADD COLUMN body_iv VARCHAR(64) NULL AFTER body_ciphertext,
  ADD COLUMN body_auth_tag VARCHAR(64) NULL AFTER body_iv,
  ADD COLUMN encryption_key_id VARCHAR(64) NULL AFTER body_auth_tag;

-- Allow body to be NULL for encrypted messages (legacy rows keep body)
ALTER TABLE chat_messages MODIFY COLUMN body TEXT NULL;
