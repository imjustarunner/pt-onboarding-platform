-- Link tasks to shared lists and add urgency, recurring, typical day/time
ALTER TABLE tasks
  ADD COLUMN task_list_id INT NULL AFTER metadata,
  ADD COLUMN urgency ENUM('low', 'medium', 'high') DEFAULT 'medium' AFTER task_list_id,
  ADD COLUMN is_recurring BOOLEAN DEFAULT FALSE AFTER urgency,
  ADD COLUMN recurring_rule JSON NULL AFTER is_recurring,
  ADD COLUMN typical_day_of_week TINYINT NULL COMMENT '0=Sun..6=Sat' AFTER recurring_rule,
  ADD COLUMN typical_time TIME NULL AFTER typical_day_of_week,
  ADD INDEX idx_tasks_task_list (task_list_id);
