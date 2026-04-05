-- Pending season joins after enrollment deadline (manager approval)

CREATE TABLE IF NOT EXISTS summit_stats_season_join_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  learning_class_id INT NOT NULL,
  user_id INT NOT NULL,
  status ENUM('pending','approved','denied','cancelled') NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  reviewed_at DATETIME NULL,
  reviewed_by_user_id INT NULL,
  UNIQUE KEY uniq_ssjr_season_user (learning_class_id, user_id),
  INDEX idx_ssjr_agency_status (agency_id, status),
  INDEX idx_ssjr_class_status (learning_class_id, status),
  CONSTRAINT fk_ssjr_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_ssjr_class FOREIGN KEY (learning_class_id) REFERENCES learning_program_classes(id) ON DELETE CASCADE,
  CONSTRAINT fk_ssjr_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_ssjr_reviewer FOREIGN KEY (reviewed_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
