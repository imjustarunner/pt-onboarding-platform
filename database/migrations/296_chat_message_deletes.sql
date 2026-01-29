-- Migration: Per-user chat message deletes (delete for me)
-- Description: Allow users to hide platform chat messages from their own view without affecting other participants.

CREATE TABLE IF NOT EXISTS chat_message_deletes (
  message_id INT NOT NULL,
  user_id INT NOT NULL,
  deleted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (message_id, user_id),
  FOREIGN KEY (message_id) REFERENCES chat_messages(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_message (user_id, message_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

