-- Beta Feedback: admin<->owner message thread for retest workflow
CREATE TABLE IF NOT EXISTS beta_feedback_messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  beta_feedback_id INT NOT NULL,
  user_id INT NOT NULL,
  message_text TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_beta_feedback_messages_feedback (beta_feedback_id),
  INDEX idx_beta_feedback_messages_user (user_id),
  INDEX idx_beta_feedback_messages_created (created_at),
  CONSTRAINT fk_beta_feedback_messages_feedback
    FOREIGN KEY (beta_feedback_id) REFERENCES beta_feedback(id) ON DELETE CASCADE,
  CONSTRAINT fk_beta_feedback_messages_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
