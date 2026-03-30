-- Summit Stats Challenge: per-user read tracking for season/team chat scopes

CREATE TABLE IF NOT EXISTS challenge_message_reads (
  id INT NOT NULL AUTO_INCREMENT,
  learning_class_id INT NOT NULL,
  user_id INT NOT NULL,
  scope VARCHAR(16) NOT NULL,
  team_id INT NOT NULL DEFAULT 0,
  last_read_message_id INT NULL,
  last_read_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_message_reads_scope (learning_class_id, user_id, scope, team_id),
  INDEX idx_message_reads_class_user (learning_class_id, user_id),
  CONSTRAINT fk_message_reads_class
    FOREIGN KEY (learning_class_id) REFERENCES learning_program_classes(id) ON DELETE CASCADE,
  CONSTRAINT fk_message_reads_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
