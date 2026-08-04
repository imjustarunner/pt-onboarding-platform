-- Migration 1123: Task collaborators (separate from single assignee)
CREATE TABLE IF NOT EXISTS task_collaborators (
  id INT PRIMARY KEY AUTO_INCREMENT,
  task_id INT NOT NULL,
  user_id INT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_task_collaborator (task_id, user_id),
  INDEX idx_tc_user (user_id),
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Move former multi-assignees (non-primary) into collaborators
INSERT IGNORE INTO task_collaborators (task_id, user_id)
SELECT task_id, user_id
FROM task_assignees
WHERE task_id IS NOT NULL AND is_primary = 0;

DELETE FROM task_assignees WHERE task_id IS NOT NULL;
