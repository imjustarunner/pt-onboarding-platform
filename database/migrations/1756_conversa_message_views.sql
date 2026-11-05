-- Pulse uses actual message visibility, independently of the unread cursor.
-- Do not backfill: sending, hiding, and marking a thread read are not views.
CREATE TABLE IF NOT EXISTS chat_message_views (
  message_id INT NOT NULL,
  user_id INT NOT NULL,
  first_seen_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (message_id, user_id),
  CONSTRAINT fk_chat_message_views_message
    FOREIGN KEY (message_id) REFERENCES chat_messages(id) ON DELETE CASCADE,
  CONSTRAINT fk_chat_message_views_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
