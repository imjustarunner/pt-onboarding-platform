-- Migration 1002: Ticket Desk fields (priority + internal notes)
ALTER TABLE support_tickets
  ADD COLUMN priority VARCHAR(16) NOT NULL DEFAULT 'medium'
    COMMENT 'low | medium | high'
    AFTER status;

ALTER TABLE support_ticket_messages
  ADD COLUMN is_internal TINYINT(1) NOT NULL DEFAULT 0
    COMMENT '1 = agency-only internal note; hidden from school_staff'
    AFTER body;

CREATE INDEX idx_support_tickets_priority ON support_tickets (priority);
CREATE INDEX idx_support_ticket_messages_internal ON support_ticket_messages (ticket_id, is_internal);
