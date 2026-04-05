-- Summit Stats Team Challenge: AI-assisted weekly task drafts (manager reviews + publishes)

CREATE TABLE IF NOT EXISTS challenge_weekly_task_drafts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  learning_class_id INT NOT NULL,
  week_start_date DATE NOT NULL,
  status ENUM('draft','published') NOT NULL DEFAULT 'draft',
  source VARCHAR(32) NOT NULL DEFAULT 'ai',
  draft_json JSON NOT NULL,
  generated_by_user_id INT NULL,
  published_by_user_id INT NULL,
  published_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_weekly_task_draft (learning_class_id, week_start_date),
  INDEX idx_weekly_task_draft_status (learning_class_id, status),
  CONSTRAINT fk_weekly_task_draft_class
    FOREIGN KEY (learning_class_id) REFERENCES learning_program_classes(id) ON DELETE CASCADE,
  CONSTRAINT fk_weekly_task_draft_generated_by
    FOREIGN KEY (generated_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_weekly_task_draft_published_by
    FOREIGN KEY (published_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);
