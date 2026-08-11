-- Migration 1181: Proposed action items attached to support tickets
CREATE TABLE support_ticket_action_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ticket_id INT NOT NULL,
  action_type VARCHAR(64) NOT NULL COMMENT 'create_school_contact | create_school_staff_account | generate_temp_password | update_school_contact | other',
  status VARCHAR(32) NOT NULL DEFAULT 'proposed' COMMENT 'proposed | approved | rejected | completed | failed',
  title VARCHAR(255) NOT NULL,
  payload_json JSON NULL COMMENT 'proposed fields: name, email, role guess, school_organization_id, source contact id, etc.',
  result_json JSON NULL COMMENT 'outcome after execution: created user/contact id, error message (never plaintext password)',
  proposed_by VARCHAR(32) NOT NULL DEFAULT 'ai',
  confidence DECIMAL(4,3) NULL,
  approved_by_user_id INT NULL,
  approved_at DATETIME NULL,
  executed_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_ticket_action_items_ticket FOREIGN KEY (ticket_id) REFERENCES support_tickets(id) ON DELETE CASCADE,
  INDEX idx_ticket_action_items_ticket (ticket_id),
  INDEX idx_ticket_action_items_status (status)
);
