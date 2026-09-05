-- Migration 1374: hub message reactions + reply routing tokens
CREATE TABLE IF NOT EXISTS communication_message_reactions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  message_id INT NOT NULL,
  conversation_id INT NOT NULL,
  user_id INT NOT NULL,
  emoji VARCHAR(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '❤️',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_cmr_msg_user_emoji (message_id, user_id, emoji),
  INDEX idx_cmr_conv (conversation_id),
  CONSTRAINT fk_cmr_msg FOREIGN KEY (message_id) REFERENCES communication_messages(id) ON DELETE CASCADE,
  CONSTRAINT fk_cmr_conv FOREIGN KEY (conversation_id) REFERENCES communication_conversations(id) ON DELETE CASCADE,
  CONSTRAINT fk_cmr_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS hub_email_reply_tokens (
  id INT AUTO_INCREMENT PRIMARY KEY,
  token_hash CHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  agency_id INT NOT NULL,
  conversation_id INT NOT NULL,
  person_key VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  created_by_user_id INT NULL,
  expires_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_hert_token (token_hash),
  INDEX idx_hert_conv (conversation_id),
  CONSTRAINT fk_hert_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_hert_conv FOREIGN KEY (conversation_id) REFERENCES communication_conversations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
