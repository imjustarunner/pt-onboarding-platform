-- Create meeting_agenda_items. Can link to task or free-form; status: pending/discussed/completed.

CREATE TABLE IF NOT EXISTS meeting_agenda_items (
  id INT PRIMARY KEY AUTO_INCREMENT,
  meeting_agenda_id INT NOT NULL,
  task_id INT NULL,
  title VARCHAR(500) NOT NULL,
  notes TEXT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  created_by_user_id INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_meeting_agenda_items_agenda (meeting_agenda_id),
  INDEX idx_meeting_agenda_items_task (task_id),
  FOREIGN KEY (meeting_agenda_id) REFERENCES meeting_agendas(id) ON DELETE CASCADE,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
