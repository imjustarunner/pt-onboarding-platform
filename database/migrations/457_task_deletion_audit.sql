-- Persist task deletion audit (task_audit_log rows are CASCADE-deleted with the task).
-- No FK to tasks so we retain a record of what was deleted.
CREATE TABLE IF NOT EXISTS task_deletion_log (
  id INT PRIMARY KEY AUTO_INCREMENT,
  task_id INT NOT NULL,
  task_title VARCHAR(255) NULL,
  actor_user_id INT NOT NULL,
  deleted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  source VARCHAR(80) NULL,
  metadata JSON NULL,
  INDEX idx_task_id (task_id),
  INDEX idx_actor (actor_user_id),
  INDEX idx_deleted_at (deleted_at),
  FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
