-- Migration 1118: Assign tasks / action items / shared lists to schedule holds
CREATE TABLE IF NOT EXISTS schedule_block_assignments (
  id INT PRIMARY KEY AUTO_INCREMENT,
  schedule_event_id INT NOT NULL,
  assignable_type ENUM('task', 'action_item', 'task_list') NOT NULL,
  assignable_id INT NOT NULL,
  assigned_by_user_id INT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  notes TEXT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_block_assignable (schedule_event_id, assignable_type, assignable_id),
  INDEX idx_block_assignments_event (schedule_event_id),
  INDEX idx_block_assignments_assignable (assignable_type, assignable_id),
  FOREIGN KEY (schedule_event_id) REFERENCES provider_schedule_events(id) ON DELETE CASCADE,
  FOREIGN KEY (assigned_by_user_id) REFERENCES users(id) ON DELETE CASCADE
);
