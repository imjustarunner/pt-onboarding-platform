-- Add encryption support to video_meeting_activity.
-- When CLIENT_CHAT_ENCRYPTION_KEY_BASE64 is configured, payload_json is encrypted at rest.
-- Existing rows keep payload_json (plaintext). New encrypted rows use payload_ciphertext.

ALTER TABLE video_meeting_activity
  ADD COLUMN payload_ciphertext MEDIUMTEXT NULL AFTER payload_json,
  ADD COLUMN payload_iv VARCHAR(64) NULL AFTER payload_ciphertext,
  ADD COLUMN payload_auth_tag VARCHAR(64) NULL AFTER payload_iv,
  ADD COLUMN encryption_key_id VARCHAR(64) NULL AFTER payload_auth_tag;
