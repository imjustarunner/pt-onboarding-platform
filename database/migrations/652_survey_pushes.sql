CREATE TABLE IF NOT EXISTS survey_pushes (
  id INT NOT NULL AUTO_INCREMENT,
  survey_id INT NOT NULL,
  user_id INT NOT NULL,
  status ENUM('pending', 'seen', 'accepted', 'dismissed') NOT NULL DEFAULT 'pending',
  seen_at DATETIME NULL,
  responded_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_survey_pushes_survey_user (survey_id, user_id),
  INDEX idx_survey_pushes_user_status (user_id, status),
  CONSTRAINT fk_survey_pushes_survey
    FOREIGN KEY (survey_id) REFERENCES surveys(id) ON DELETE CASCADE,
  CONSTRAINT fk_survey_pushes_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
