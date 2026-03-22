-- Per-session curriculum PDF + extracted text; encrypted clinical H2014 notes per client per session.

CREATE TABLE IF NOT EXISTS skill_builders_event_session_curriculum (
  id INT AUTO_INCREMENT PRIMARY KEY,
  session_id INT NOT NULL,
  company_event_id INT NOT NULL,
  agency_id INT NOT NULL,
  skills_group_id INT NOT NULL,
  storage_path VARCHAR(512) NOT NULL,
  original_filename VARCHAR(255) NOT NULL,
  mime_type VARCHAR(128) NOT NULL DEFAULT 'application/pdf',
  file_size_bytes INT NULL,
  extract_status ENUM('pending','ok','failed','empty') NOT NULL DEFAULT 'pending',
  extracted_text_enc LONGTEXT NULL COMMENT 'JSON envelope from chat encryption when configured',
  uploaded_by_user_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_sb_sess_curr_session (session_id),
  INDEX idx_sb_sess_curr_event (company_event_id),
  INDEX idx_sb_sess_curr_agency (agency_id),
  INDEX idx_sb_sess_curr_sg (skills_group_id),
  CONSTRAINT fk_sb_sess_curr_session FOREIGN KEY (session_id) REFERENCES skill_builders_event_sessions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS skill_builders_session_clinical_notes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  company_event_id INT NOT NULL,
  session_id INT NOT NULL,
  client_id INT NOT NULL,
  author_user_id INT NOT NULL,
  note_body_enc LONGTEXT NOT NULL COMMENT 'Encrypted final note text or JSON',
  output_json_enc LONGTEXT NULL COMMENT 'Optional structured sections JSON encrypted',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_sb_clin_sess_client (session_id, client_id),
  INDEX idx_sb_clin_event (company_event_id),
  INDEX idx_sb_clin_session (session_id),
  INDEX idx_sb_clin_client (client_id),
  INDEX idx_sb_clin_agency (agency_id),
  CONSTRAINT fk_sb_clin_session FOREIGN KEY (session_id) REFERENCES skill_builders_event_sessions(id) ON DELETE CASCADE,
  CONSTRAINT fk_sb_clin_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
