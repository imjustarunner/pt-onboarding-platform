-- Emoji reactions on season/team chat messages
CREATE TABLE IF NOT EXISTS challenge_message_reactions (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  message_id   INT NOT NULL,
  user_id      INT NOT NULL,
  emoji        VARCHAR(64) NOT NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_msg_reaction (message_id, user_id, emoji),
  INDEX idx_cmr_message (message_id),
  INDEX idx_cmr_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
