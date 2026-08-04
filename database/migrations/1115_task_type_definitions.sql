-- Migration 1115: Task type definitions (colors + icons) for Tasks hub
CREATE TABLE IF NOT EXISTS task_type_definitions (
  id INT PRIMARY KEY AUTO_INCREMENT,
  agency_id INT NULL COMMENT 'NULL = platform default',
  slug VARCHAR(64) NOT NULL,
  label VARCHAR(120) NOT NULL,
  color_hex VARCHAR(7) NOT NULL DEFAULT '#64748b',
  icon_key VARCHAR(64) NOT NULL DEFAULT 'circle',
  icon_choices_json JSON NULL COMMENT 'Array of allowed icon keys',
  system_task_type VARCHAR(32) NULL COMMENT 'Maps to tasks.task_type when system-linked',
  sort_order INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_by_user_id INT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_task_type_agency_slug (agency_id, slug),
  INDEX idx_task_type_agency (agency_id),
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_task_type_prefs (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  task_type_definition_id INT NOT NULL,
  is_hidden TINYINT(1) NOT NULL DEFAULT 0,
  preferred_icon_key VARCHAR(64) NULL,
  sort_order INT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_task_type_pref (user_id, task_type_definition_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (task_type_definition_id) REFERENCES task_type_definitions(id) ON DELETE CASCADE
);

ALTER TABLE tasks
  ADD COLUMN work_type_id INT NULL DEFAULT NULL
  COMMENT 'Optional UI work type (task_type_definitions.id)'
  AFTER department_id;

ALTER TABLE tasks
  ADD COLUMN work_type_icon_key VARCHAR(64) NULL DEFAULT NULL
  COMMENT 'Optional per-task icon override'
  AFTER work_type_id;

ALTER TABLE tasks
  ADD INDEX idx_tasks_work_type (work_type_id);

INSERT INTO task_type_definitions
  (agency_id, slug, label, color_hex, icon_key, icon_choices_json, system_task_type, sort_order)
VALUES
  (NULL, 'documentation', 'Documentation', '#7c3aed', 'file-text', '["file-text","clipboard","book-open","pen"]', NULL, 10),
  (NULL, 'administrative', 'Administrative', '#16a34a', 'briefcase', '["briefcase","folder","settings","building"]', NULL, 20),
  (NULL, 'client_care', 'Client Care', '#2563eb', 'heart', '["heart","users","stethoscope","hand-heart"]', NULL, 30),
  (NULL, 'outreach', 'Outreach', '#ca8a04', 'phone', '["phone","mail","megaphone","message-circle"]', NULL, 40),
  (NULL, 'personal', 'Personal', '#9333ea', 'user', '["user","home","coffee","sun"]', NULL, 50),
  (NULL, 'training', 'Training', '#ea580c', 'graduation-cap', '["graduation-cap","book","lightbulb","award"]', 'training', 60),
  (NULL, 'document', 'Document', '#0f766e', 'file-signature', '["file-signature","file-check","stamp"]', 'document', 70),
  (NULL, 'meeting_action', 'Meeting Action', '#db2777', 'list-checks', '["list-checks","check-square","calendar-check"]', 'meeting_action', 80),
  (NULL, 'escalation', 'Escalation', '#dc2626', 'alert-triangle', '["alert-triangle","siren","flag"]', 'escalation', 90),
  (NULL, 'custom', 'General', '#64748b', 'circle', '["circle","star","zap","target"]', 'custom', 100);
