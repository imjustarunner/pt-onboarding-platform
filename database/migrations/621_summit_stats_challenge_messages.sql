-- Summit Stats Team Challenge: in-app message feed for each season dashboard

CREATE TABLE IF NOT EXISTS challenge_messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  learning_class_id INT NOT NULL,
  team_id INT NULL,
  user_id INT NOT NULL,
  message_text TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_challenge_messages_class_created (learning_class_id, created_at),
  INDEX idx_challenge_messages_team (team_id),
  CONSTRAINT fk_challenge_messages_class
    FOREIGN KEY (learning_class_id) REFERENCES learning_program_classes(id) ON DELETE CASCADE,
  CONSTRAINT fk_challenge_messages_team
    FOREIGN KEY (team_id) REFERENCES challenge_teams(id) ON DELETE SET NULL,
  CONSTRAINT fk_challenge_messages_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
