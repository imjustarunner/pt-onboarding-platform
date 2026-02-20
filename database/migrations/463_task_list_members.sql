-- Explicit membership for shared task lists (viewer, editor, admin)
CREATE TABLE IF NOT EXISTS task_list_members (
  id INT PRIMARY KEY AUTO_INCREMENT,
  task_list_id INT NOT NULL,
  user_id INT NOT NULL,
  role ENUM('viewer', 'editor', 'admin') NOT NULL DEFAULT 'viewer',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_task_list_member (task_list_id, user_id),
  INDEX idx_task_list_members_user (user_id),
  FOREIGN KEY (task_list_id) REFERENCES task_lists(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
