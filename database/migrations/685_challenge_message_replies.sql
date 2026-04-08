-- Add parent_message_id to support threaded replies in season/team chat
ALTER TABLE challenge_messages
  ADD COLUMN parent_message_id INT NULL DEFAULT NULL AFTER attachments_json;

ALTER TABLE challenge_messages
  ADD INDEX idx_challenge_messages_parent (parent_message_id);
