-- Migration: Company events phase 3 operational tooling

ALTER TABLE company_event_audiences
  MODIFY COLUMN audience_type ENUM('user','group','role') NOT NULL;

ALTER TABLE company_events
  ADD COLUMN reminder_config_json JSON NULL AFTER voting_config_json;

CREATE TABLE IF NOT EXISTS company_event_dispatch_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_event_id INT NOT NULL,
  user_id INT NOT NULL,
  channel ENUM('in_app','sms') NOT NULL,
  dispatch_type VARCHAR(64) NOT NULL,
  occurrence_key VARCHAR(64) NULL,
  status ENUM('queued','sent','failed','skipped') NOT NULL DEFAULT 'queued',
  status_reason VARCHAR(255) NULL,
  twilio_sid VARCHAR(64) NULL,
  payload_json JSON NULL,
  sent_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_company_event_dispatch_event (company_event_id, dispatch_type, status),
  INDEX idx_company_event_dispatch_user (user_id, company_event_id),
  INDEX idx_company_event_dispatch_occurrence (company_event_id, occurrence_key),
  FOREIGN KEY (company_event_id) REFERENCES company_events(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS company_event_message_templates (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  name VARCHAR(120) NOT NULL,
  title_template VARCHAR(255) NOT NULL,
  message_template TEXT NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_by_user_id INT NULL,
  updated_by_user_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_company_event_template_name (agency_id, name),
  INDEX idx_company_event_template_agency_active (agency_id, is_active),
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
