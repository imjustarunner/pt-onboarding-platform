-- Shared task lists (e.g., Skill Builders) - agency-scoped, explicit membership
CREATE TABLE IF NOT EXISTS task_lists (
  id INT PRIMARY KEY AUTO_INCREMENT,
  agency_id INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  created_by_user_id INT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_task_lists_agency (agency_id),
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE CASCADE
);
