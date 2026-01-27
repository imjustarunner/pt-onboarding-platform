-- Payroll: blocking To-Dos / Notes (single + recurring templates)
-- These are used to block running payroll until required items are marked Done.

CREATE TABLE IF NOT EXISTS payroll_todo_templates (
  id INT NOT NULL AUTO_INCREMENT,
  agency_id INT NOT NULL,
  title VARCHAR(180) NOT NULL,
  description TEXT NULL,
  scope ENUM('agency','provider') NOT NULL DEFAULT 'agency',
  target_user_id INT NOT NULL DEFAULT 0, -- for provider-scoped templates; 0 means "not applicable"
  start_payroll_period_id INT NOT NULL DEFAULT 0, -- 0 means "start immediately"
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_by_user_id INT NOT NULL,
  updated_by_user_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_agency (agency_id),
  KEY idx_active (agency_id, is_active),
  KEY idx_start_period (agency_id, start_payroll_period_id),
  CONSTRAINT fk_ptt_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_ptt_created_by FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_ptt_updated_by FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payroll_period_todos (
  id INT NOT NULL AUTO_INCREMENT,
  payroll_period_id INT NOT NULL,
  agency_id INT NOT NULL,
  template_id INT NULL,
  title VARCHAR(180) NOT NULL,
  description TEXT NULL,
  scope ENUM('agency','provider') NOT NULL DEFAULT 'agency',
  target_user_id INT NOT NULL DEFAULT 0, -- 0 means agency-wide
  status ENUM('pending','done') NOT NULL DEFAULT 'pending',
  done_at TIMESTAMP NULL,
  done_by_user_id INT NULL,
  created_by_user_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_period_template_target (payroll_period_id, template_id, target_user_id),
  KEY idx_period (payroll_period_id),
  KEY idx_agency (agency_id),
  KEY idx_status (payroll_period_id, status),
  KEY idx_target_user (payroll_period_id, target_user_id),
  CONSTRAINT fk_ppt_period FOREIGN KEY (payroll_period_id) REFERENCES payroll_periods(id) ON DELETE CASCADE,
  CONSTRAINT fk_ppt_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_ppt_template FOREIGN KEY (template_id) REFERENCES payroll_todo_templates(id) ON DELETE SET NULL,
  CONSTRAINT fk_ppt_done_by FOREIGN KEY (done_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_ppt_created_by FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

