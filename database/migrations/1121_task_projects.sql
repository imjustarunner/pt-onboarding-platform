-- Migration 1121: Task projects (workspace containers for shared lists + tasks)
CREATE TABLE IF NOT EXISTS task_projects (
  id INT PRIMARY KEY AUTO_INCREMENT,
  agency_id INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT NULL,
  created_by_user_id INT NOT NULL,
  due_date DATE NULL,
  status ENUM('active', 'completed', 'archived') NOT NULL DEFAULT 'active',
  is_starred TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_task_projects_agency (agency_id, status),
  INDEX idx_task_projects_creator (created_by_user_id),
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS task_project_lists (
  id INT PRIMARY KEY AUTO_INCREMENT,
  project_id INT NOT NULL,
  task_list_id INT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_project_list (project_id, task_list_id),
  INDEX idx_tpl_list (task_list_id),
  FOREIGN KEY (project_id) REFERENCES task_projects(id) ON DELETE CASCADE,
  FOREIGN KEY (task_list_id) REFERENCES task_lists(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS task_project_members (
  id INT PRIMARY KEY AUTO_INCREMENT,
  project_id INT NOT NULL,
  user_id INT NOT NULL,
  role ENUM('viewer', 'editor', 'admin') NOT NULL DEFAULT 'viewer',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_project_member (project_id, user_id),
  INDEX idx_tpm_user (user_id),
  FOREIGN KEY (project_id) REFERENCES task_projects(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

ALTER TABLE tasks
  ADD COLUMN project_id INT NULL DEFAULT NULL
  COMMENT 'Optional task project association'
  AFTER task_list_id;

ALTER TABLE tasks
  ADD INDEX idx_tasks_project_id (project_id);
