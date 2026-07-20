-- Migration 1003: Files inbox index helpers + Bookmarks + Pins for platform chat

CREATE TABLE IF NOT EXISTS chat_message_bookmarks (
  user_id INT NOT NULL,
  message_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, message_id),
  INDEX idx_chat_bookmarks_user_created (user_id, created_at),
  CONSTRAINT fk_chat_bookmarks_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_chat_bookmarks_message FOREIGN KEY (message_id) REFERENCES chat_messages(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS chat_thread_pins (
  thread_id INT NOT NULL,
  message_id INT NOT NULL,
  pinned_by_user_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (thread_id, message_id),
  INDEX idx_chat_pins_thread_created (thread_id, created_at),
  CONSTRAINT fk_chat_pins_thread FOREIGN KEY (thread_id) REFERENCES chat_threads(id) ON DELETE CASCADE,
  CONSTRAINT fk_chat_pins_message FOREIGN KEY (message_id) REFERENCES chat_messages(id) ON DELETE CASCADE,
  CONSTRAINT fk_chat_pins_user FOREIGN KEY (pinned_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_chat_msg_attachments_created
  ON chat_message_attachments (created_at);
