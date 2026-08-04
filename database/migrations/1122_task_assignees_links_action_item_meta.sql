-- Migration 1122: Multi-assignees, links, action-item list/project/private
ALTER TABLE task_action_items
  ADD COLUMN task_list_id INT NULL DEFAULT NULL
  COMMENT 'Optional shared list association'
  AFTER agency_id;

ALTER TABLE task_action_items
  ADD COLUMN project_id INT NULL DEFAULT NULL
  COMMENT 'Optional project association'
  AFTER task_list_id;

ALTER TABLE task_action_items
  ADD COLUMN is_private TINYINT(1) NOT NULL DEFAULT 0
  COMMENT 'Visible only to assignee and creator'
  AFTER project_id;

ALTER TABLE task_action_items
  ADD INDEX idx_tai_list (task_list_id);

ALTER TABLE task_action_items
  ADD INDEX idx_tai_project (project_id);

ALTER TABLE task_action_items
  ADD INDEX idx_tai_private (is_private);

CREATE TABLE IF NOT EXISTS task_assignees (
  id INT PRIMARY KEY AUTO_INCREMENT,
  task_id INT NULL,
  action_item_id INT NULL,
  user_id INT NOT NULL,
  is_primary TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_task_assignee (task_id, user_id),
  UNIQUE KEY uq_ai_assignee (action_item_id, user_id),
  INDEX idx_ta_user (user_id),
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (action_item_id) REFERENCES task_action_items(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS task_links (
  id INT PRIMARY KEY AUTO_INCREMENT,
  task_id INT NULL,
  action_item_id INT NULL,
  url VARCHAR(2000) NOT NULL,
  label VARCHAR(255) NULL,
  created_by_user_id INT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_tl_task (task_id),
  INDEX idx_tl_action_item (action_item_id),
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (action_item_id) REFERENCES task_action_items(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS action_item_attachments (
  id INT PRIMARY KEY AUTO_INCREMENT,
  action_item_id INT NOT NULL,
  storage_path VARCHAR(500) NOT NULL,
  filename VARCHAR(255) NOT NULL,
  content_type VARCHAR(120) NULL,
  uploaded_by_user_id INT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_aia_item (action_item_id),
  FOREIGN KEY (action_item_id) REFERENCES task_action_items(id) ON DELETE CASCADE,
  FOREIGN KEY (uploaded_by_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS action_item_comments (
  id INT PRIMARY KEY AUTO_INCREMENT,
  action_item_id INT NOT NULL,
  user_id INT NOT NULL,
  body TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_aic_item (action_item_id),
  FOREIGN KEY (action_item_id) REFERENCES task_action_items(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
