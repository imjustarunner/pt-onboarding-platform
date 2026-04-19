-- Migration: emoji + custom-icon reactions on platform chat_messages
--
-- Mirrors the activity-feed reactions pattern. A user can stack different
-- reactions on the same message (e.g. fire + clap), but cannot add the same
-- reaction code twice. reaction_icon_id optionally points at the same /icons
-- system used for workout reactions for tenant-branded reactions.

CREATE TABLE IF NOT EXISTS chat_message_reactions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  message_id INT NOT NULL,
  user_id INT NOT NULL,
  reaction_code VARCHAR(64) NOT NULL,
  reaction_icon_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_chat_msg_reaction_user (message_id, user_id, reaction_code),
  INDEX idx_chat_msg_reactions_message (message_id),
  INDEX idx_chat_msg_reactions_user (user_id),
  CONSTRAINT fk_chat_msg_reactions_message
    FOREIGN KEY (message_id) REFERENCES chat_messages(id) ON DELETE CASCADE,
  CONSTRAINT fk_chat_msg_reactions_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
