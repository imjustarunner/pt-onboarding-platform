-- Soft-delete support ticket messages (avoid semicolons in comments)
-- This supports removing school_staff test messages while preserving thread structure

ALTER TABLE support_ticket_messages
  ADD COLUMN is_deleted TINYINT(1) NOT NULL DEFAULT 0;

ALTER TABLE support_ticket_messages
  ADD COLUMN deleted_at TIMESTAMP NULL;

ALTER TABLE support_ticket_messages
  ADD COLUMN deleted_by_user_id INT NULL;

CREATE INDEX idx_support_ticket_messages_ticket_deleted
  ON support_ticket_messages (ticket_id, is_deleted);

