-- Summit Stats Team Challenge: captain application workflow

CREATE TABLE IF NOT EXISTS challenge_captain_applications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  learning_class_id INT NOT NULL,
  user_id INT NOT NULL,
  status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  application_text TEXT NULL,
  manager_notes TEXT NULL,
  reviewed_by_user_id INT NULL,
  reviewed_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_class_user (learning_class_id, user_id),
  INDEX idx_captain_app_class_status (learning_class_id, status),
  CONSTRAINT fk_captain_app_class
    FOREIGN KEY (learning_class_id) REFERENCES learning_program_classes(id) ON DELETE CASCADE,
  CONSTRAINT fk_captain_app_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_captain_app_reviewer
    FOREIGN KEY (reviewed_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);
