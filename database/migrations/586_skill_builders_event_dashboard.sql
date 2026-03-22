-- Skill Builders event dashboard: display times, session location/modality, client attendance, agency auto clock-out

ALTER TABLE company_events
  ADD COLUMN client_check_in_display_time TIME NULL DEFAULT NULL
    COMMENT 'Wall time shown to guardians for expected client arrival' AFTER cash_eligible,
  ADD COLUMN client_check_out_display_time TIME NULL DEFAULT NULL
    COMMENT 'Wall time shown to guardians for expected client pickup' AFTER client_check_in_display_time,
  ADD COLUMN employee_report_time TIME NULL DEFAULT NULL
    COMMENT 'Staff report (arrival) time of day for payroll context' AFTER client_check_out_display_time,
  ADD COLUMN employee_departure_time TIME NULL DEFAULT NULL
    COMMENT 'Staff departure time of day for payroll context' AFTER employee_report_time;

ALTER TABLE skill_builders_event_sessions
  ADD COLUMN location_label VARCHAR(512) NULL DEFAULT NULL
    COMMENT 'Human-readable location for this occurrence' AFTER timezone,
  ADD COLUMN location_address TEXT NULL
    COMMENT 'Optional address or room detail' AFTER location_label,
  ADD COLUMN modality VARCHAR(32) NULL DEFAULT NULL
    COMMENT 'in_person | virtual | hybrid' AFTER location_address,
  ADD COLUMN join_url VARCHAR(1024) NULL DEFAULT NULL
    COMMENT 'Video join URL when modality is virtual/hybrid' AFTER modality;

ALTER TABLE agencies
  ADD COLUMN skill_builder_auto_clock_out_minutes_after_session_end INT NULL DEFAULT NULL
    COMMENT 'If set, auto clock-out providers this many minutes after session end';

CREATE TABLE IF NOT EXISTS skill_builders_client_session_attendance (
  id INT AUTO_INCREMENT PRIMARY KEY,
  session_id INT NOT NULL,
  client_id INT NOT NULL,
  check_in_at DATETIME NULL DEFAULT NULL,
  check_out_at DATETIME NULL DEFAULT NULL,
  checked_out_by_user_id INT NULL DEFAULT NULL,
  signature_text VARCHAR(512) NULL DEFAULT NULL,
  manual_entry TINYINT(1) NOT NULL DEFAULT 0,
  created_by_user_id INT NULL DEFAULT NULL,
  updated_by_user_id INT NULL DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_sb_client_sess_att (session_id, client_id),
  INDEX idx_sb_csa_client (client_id),
  FOREIGN KEY (session_id) REFERENCES skill_builders_event_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  FOREIGN KEY (checked_out_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
