-- Migration: Company events phase 2 (RSVP/voting responses + SMS code)

ALTER TABLE company_events
  ADD COLUMN sms_code VARCHAR(32) NULL AFTER voting_closed_at;

CREATE TABLE IF NOT EXISTS company_event_responses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_event_id INT NOT NULL,
  user_id INT NOT NULL,
  response_key VARCHAR(32) NOT NULL,
  response_label VARCHAR(255) NULL,
  response_body TEXT NULL,
  source ENUM('in_app','sms') NOT NULL DEFAULT 'in_app',
  from_number VARCHAR(32) NULL,
  received_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_company_event_response (company_event_id, user_id),
  INDEX idx_company_event_response_event (company_event_id, response_key),
  INDEX idx_company_event_response_user (user_id, company_event_id),
  FOREIGN KEY (company_event_id) REFERENCES company_events(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
