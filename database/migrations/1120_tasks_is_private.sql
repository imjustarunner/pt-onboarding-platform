-- Migration 1120: Private tasks + hub hide preferences
ALTER TABLE tasks
  ADD COLUMN is_private TINYINT(1) NOT NULL DEFAULT 0
  COMMENT 'When 1, hidden from Team/All views; visible to assignee and creator only'
  AFTER work_type_icon_key;

ALTER TABLE tasks
  ADD INDEX idx_tasks_is_private (is_private);
