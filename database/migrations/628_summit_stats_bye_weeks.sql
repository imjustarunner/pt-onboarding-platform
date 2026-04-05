-- Summit Stats Team Challenge: participant bye week declarations

CREATE TABLE IF NOT EXISTS challenge_bye_weeks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  learning_class_id INT NOT NULL,
  provider_user_id INT NOT NULL,
  week_start_date DATE NOT NULL,
  status ENUM('declared','used','cancelled') NOT NULL DEFAULT 'declared',
  declared_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  note VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_challenge_bye_week (learning_class_id, provider_user_id, week_start_date),
  INDEX idx_challenge_bye_week_class_user (learning_class_id, provider_user_id),
  CONSTRAINT fk_challenge_bye_week_class
    FOREIGN KEY (learning_class_id) REFERENCES learning_program_classes(id) ON DELETE CASCADE,
  CONSTRAINT fk_challenge_bye_week_user
    FOREIGN KEY (provider_user_id) REFERENCES users(id) ON DELETE CASCADE
);
