-- Migration 1253: Multi-step response plans for school support tickets (Phase 4)
CREATE TABLE support_ticket_response_plans (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ticket_id INT NOT NULL,
  intent_key VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'general',
  plan_type VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'school_email',
  title VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  status VARCHAR(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'proposed'
    COMMENT 'proposed | in_progress | completed | dismissed',
  steps_json JSON NOT NULL COMMENT 'Ordered plan steps: match, status, draft, actions, notify',
  summary_json JSON NULL COMMENT 'Client match, checklist snapshot, action counts',
  proposed_by VARCHAR(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ai',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_response_plans_ticket FOREIGN KEY (ticket_id) REFERENCES support_tickets(id) ON DELETE CASCADE,
  UNIQUE KEY uq_response_plan_ticket (ticket_id),
  INDEX idx_response_plans_status (status)
);

ALTER TABLE support_ticket_action_items
  ADD COLUMN response_plan_id INT NULL DEFAULT NULL COMMENT 'Parent response plan when step is part of a plan',
  ADD COLUMN response_plan_step INT NULL DEFAULT NULL COMMENT 'Step order within the response plan',
  ADD CONSTRAINT fk_ticket_action_response_plan
    FOREIGN KEY (response_plan_id) REFERENCES support_ticket_response_plans(id) ON DELETE SET NULL;
