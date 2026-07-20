-- Migration 1000: Slack-lite reply threads + @mentions for platform chat
-- parent_message_id always points at the root message (not nested trees).

ALTER TABLE chat_messages
  ADD COLUMN parent_message_id INT NULL DEFAULT NULL
    COMMENT 'Root message id for reply threads',
  ADD INDEX idx_chat_messages_parent (parent_message_id),
  ADD CONSTRAINT fk_chat_messages_parent
    FOREIGN KEY (parent_message_id) REFERENCES chat_messages(id) ON DELETE CASCADE;

CREATE TABLE chat_message_mentions (
  message_id INT NOT NULL,
  mentioned_user_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (message_id, mentioned_user_id),
  INDEX idx_chat_mentions_user (mentioned_user_id, created_at),
  CONSTRAINT fk_chat_mentions_message
    FOREIGN KEY (message_id) REFERENCES chat_messages(id) ON DELETE CASCADE,
  CONSTRAINT fk_chat_mentions_user
    FOREIGN KEY (mentioned_user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
