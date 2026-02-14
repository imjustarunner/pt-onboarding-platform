-- Migration: Client daily notes and program-scoped checklists
-- Description: client_daily_notes, program_checklist_enabled_items

-- Daily notes per client per author per day (program-scoped)
CREATE TABLE IF NOT EXISTS client_daily_notes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  client_id INT NOT NULL,
  author_id INT NOT NULL,
  program_id INT NULL,
  note_date DATE NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_client_daily_note (client_id, author_id, note_date),
  CONSTRAINT fk_daily_notes_client
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  CONSTRAINT fk_daily_notes_author
    FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_daily_notes_program
    FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE SET NULL,
  INDEX idx_daily_notes_client (client_id),
  INDEX idx_daily_notes_program (program_id),
  INDEX idx_daily_notes_date (note_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Program-scoped checklist items (which items apply to clients in this program)
CREATE TABLE IF NOT EXISTS program_checklist_enabled_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  program_id INT NOT NULL,
  checklist_item_id INT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_program_checklist (program_id, checklist_item_id),
  CONSTRAINT fk_program_checklist_program
    FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE CASCADE,
  CONSTRAINT fk_program_checklist_item
    FOREIGN KEY (checklist_item_id) REFERENCES custom_checklist_items(id) ON DELETE CASCADE,
  INDEX idx_program_checklist_program (program_id),
  INDEX idx_program_checklist_item (checklist_item_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
