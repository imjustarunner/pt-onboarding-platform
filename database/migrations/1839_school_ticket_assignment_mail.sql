-- Existing tickets and audit events are preserved. Only assignments/events after
-- activation are picked up automatically; explicit assignments send immediately.
CREATE TABLE IF NOT EXISTS ticket_assignment_email_settings (
  id TINYINT NOT NULL PRIMARY KEY,
  enabled_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
);
INSERT IGNORE INTO ticket_assignment_email_settings (id) VALUES (1);

CREATE TABLE IF NOT EXISTS ticket_assignment_email_deliveries (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  ticket_id INT NOT NULL,
  assignee_user_id INT NOT NULL,
  assignment_key CHAR(64) NOT NULL,
  assignment_at DATETIME(3) NOT NULL,
  delivery_status VARCHAR(20) NOT NULL DEFAULT 'sending',
  communication_id INT NULL,
  sent_at DATETIME NULL,
  error_code VARCHAR(120) NULL,
  actor_source VARCHAR(64) NOT NULL DEFAULT 'ticket_assignment_automation',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_ticket_assignment_email (assignment_key),
  KEY idx_ticket_assignment_delivery (ticket_id,assignee_user_id,assignment_at)
);

CREATE TABLE IF NOT EXISTS school_onboarding_workflow_tickets (
  invite_id INT NOT NULL PRIMARY KEY,
  ticket_id INT NOT NULL,
  stage_key VARCHAR(160) NOT NULL,
  stage VARCHAR(32) NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_school_onboarding_workflow_ticket (ticket_id)
);
