CREATE TABLE IF NOT EXISTS guardian_learning_plan_reviews (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  client_id INT NOT NULL,
  learning_plan_id INT NOT NULL,
  guardian_user_id INT NOT NULL,
  plan_revision CHAR(64) NOT NULL,
  signed_name VARCHAR(255) NULL,
  signed_at DATETIME NULL,
  retired_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_guardian_learning_review (learning_plan_id,guardian_user_id,plan_revision),
  KEY idx_guardian_learning_review_account (guardian_user_id,agency_id,client_id),
  CONSTRAINT fk_guardian_learning_review_plan FOREIGN KEY (learning_plan_id) REFERENCES student_learning_plans(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS guardian_learning_plan_ratings (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  client_id INT NOT NULL,
  learning_plan_id INT NOT NULL,
  plan_goal_id INT NOT NULL,
  guardian_user_id INT NOT NULL,
  plan_revision CHAR(64) NOT NULL,
  scale_value TINYINT UNSIGNED NOT NULL,
  rated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_guardian_learning_rating_own (guardian_user_id,agency_id,client_id,plan_goal_id,rated_at),
  CONSTRAINT fk_guardian_learning_rating_plan FOREIGN KEY (learning_plan_id) REFERENCES student_learning_plans(id) ON DELETE CASCADE,
  CONSTRAINT fk_guardian_learning_rating_goal FOREIGN KEY (plan_goal_id) REFERENCES student_learning_plan_goals(id) ON DELETE CASCADE,
  CONSTRAINT chk_guardian_learning_rating_scale CHECK (scale_value BETWEEN 1 AND 10)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
