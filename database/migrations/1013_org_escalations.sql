-- Migration 1013: Organization Escalations (structured leadership workflow on support tickets)

ALTER TABLE support_tickets
  ADD COLUMN ticket_kind VARCHAR(32) NOT NULL DEFAULT 'support'
  COMMENT 'support = help desk ticket; escalation = org leadership escalation';

ALTER TABLE support_tickets
  ADD COLUMN escalation_status VARCHAR(40) NULL DEFAULT NULL
  COMMENT 'submitted|under_review|assigned|awaiting_information|resolved|closed';

ALTER TABLE support_tickets
  ADD COLUMN root_cause TEXT NULL
  COMMENT 'Why it happened / contributing factors (escalations)';

ALTER TABLE support_tickets
  ADD COLUMN recommended_resolution TEXT NULL
  COMMENT 'How the submitter believes it should be addressed';

ALTER TABLE support_tickets
  ADD COLUMN affected_department VARCHAR(120) NULL
  COMMENT 'Department impacted by the escalation';

ALTER TABLE support_tickets
  ADD COLUMN related_project VARCHAR(255) NULL
  COMMENT 'Optional related client/project label';

ALTER TABLE support_tickets
  ADD COLUMN immediate_action_required TINYINT(1) NOT NULL DEFAULT 0
  COMMENT '1 = submitter flagged immediate action needed';

ALTER TABLE support_tickets
  ADD COLUMN resolution_outcome TEXT NULL
  COMMENT 'Final resolution outcome closed with the submitter';

CREATE INDEX idx_support_tickets_ticket_kind ON support_tickets (ticket_kind);
CREATE INDEX idx_support_tickets_escalation_status ON support_tickets (escalation_status);

CREATE TABLE IF NOT EXISTS support_ticket_attachments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ticket_id INT NOT NULL,
  uploaded_by_user_id INT NULL,
  file_name VARCHAR(255) NOT NULL,
  file_path VARCHAR(500) NOT NULL,
  mime_type VARCHAR(120) NULL,
  file_size INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_sta_ticket (ticket_id),
  CONSTRAINT fk_sta_ticket FOREIGN KEY (ticket_id) REFERENCES support_tickets(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Optional files/screenshots for support tickets and escalations';

ALTER TABLE agencies
  ADD COLUMN escalation_routing_json JSON NULL
  COMMENT 'Ordered chain of responsibility: [{type:user|role, value:id|roleName}]';
