-- Migration: link a chat_message back to the announcement that produced it
--
-- When a captain posts a "Message your team" with type banner/splash, we
-- write both an agency_scheduled_announcements row AND a chat_messages row
-- in the team thread. announcement_id lets the UI badge the message as
-- "Posted as announcement" and lets us avoid double-posting on edits.

ALTER TABLE chat_messages
  ADD COLUMN announcement_id INT NULL AFTER body,
  ADD INDEX idx_chat_messages_announcement (announcement_id),
  ADD CONSTRAINT fk_chat_messages_announcement
    FOREIGN KEY (announcement_id) REFERENCES agency_scheduled_announcements(id) ON DELETE SET NULL;
