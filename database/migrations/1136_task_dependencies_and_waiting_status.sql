-- Migration 1136: task dependencies and waiting status
-- Adds a task_dependencies table so tasks can be blocked by other tasks.
-- When a blocking task is completed, dependent tasks move from 'waiting' to 'pending'.

CREATE TABLE IF NOT EXISTS task_dependencies (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  task_id       INT UNSIGNED NOT NULL COMMENT 'The task that is waiting/blocked',
  depends_on_id INT UNSIGNED NOT NULL COMMENT 'The task that must be completed first',
  created_by    INT UNSIGNED NULL DEFAULT NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_task_dep (task_id, depends_on_id),
  KEY idx_task_dep_task (task_id),
  KEY idx_task_dep_depends_on (depends_on_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Extend tasks.status to allow 'waiting'
ALTER TABLE tasks
  MODIFY COLUMN status ENUM('pending','in_progress','completed','overridden','waiting')
    NOT NULL DEFAULT 'pending'
    COMMENT 'waiting = blocked by a dependency';
