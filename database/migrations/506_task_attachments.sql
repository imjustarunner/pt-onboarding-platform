-- Task attachments: photos, docs for reference on shared list tasks
CREATE TABLE IF NOT EXISTS task_attachments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  task_id INT NOT NULL,
  storage_path VARCHAR(500) NOT NULL COMMENT 'GCS key (e.g. uploads/task_attachments/...)',
  filename VARCHAR(255) NOT NULL,
  content_type VARCHAR(100) NULL,
  uploaded_by_user_id INT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (uploaded_by_user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_task_attachments_task (task_id)
);
