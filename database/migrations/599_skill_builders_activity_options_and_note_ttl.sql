-- Activity option chips for H2014 Skill Builders Clinical Aid + per-note expiry (14-day copy aid).

CREATE TABLE IF NOT EXISTS skill_builders_activity_options (
  id INT AUTO_INCREMENT PRIMARY KEY,
  skills_group_id INT NOT NULL,
  label VARCHAR(255) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_sb_actopt_sg (skills_group_id),
  CONSTRAINT fk_sb_actopt_sg FOREIGN KEY (skills_group_id) REFERENCES skills_groups(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE skill_builders_session_clinical_notes
  ADD COLUMN expires_at DATETIME NULL COMMENT 'Auto-purge copy-aid notes (default 14 days from create)' AFTER updated_at,
  ADD COLUMN selected_activity_ids_json TEXT NULL COMMENT 'JSON array of skill_builders_activity_options.id' AFTER expires_at,
  ADD COLUMN client_note_status ENUM('note_needed','completed','missed') NOT NULL DEFAULT 'note_needed' AFTER selected_activity_ids_json;
