-- Migration 1256: Lifecycle checklist completion date audit trail
-- Keeps the immediately prior completion date on the row and a full change log.

ALTER TABLE user_lifecycle_checklist_items
  ADD COLUMN previous_completed_at TIMESTAMP NULL
  COMMENT 'Most recent completion date before the current completed_at (audit)';

CREATE TABLE IF NOT EXISTS user_lifecycle_checklist_date_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  definition_id INT NOT NULL,
  previous_completed_at DATE NULL COMMENT 'Completion date before the change',
  new_completed_at DATE NULL COMMENT 'Completion date after the change',
  changed_by_user_id INT NULL,
  changed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ulcdh_user_def (user_id, definition_id),
  INDEX idx_ulcdh_changed_at (changed_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (definition_id) REFERENCES lifecycle_checklist_definitions(id) ON DELETE CASCADE,
  FOREIGN KEY (changed_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
