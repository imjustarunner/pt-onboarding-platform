-- Migration: Support ticket claiming / assignment
-- Description: Allow a single admin/support/staff member to claim a ticket and prevent others from answering it.

ALTER TABLE support_tickets
ADD COLUMN claimed_by_user_id INT NULL,
ADD COLUMN claimed_at DATETIME NULL;

ALTER TABLE support_tickets
ADD CONSTRAINT fk_support_tickets_claimed_by_user_id
FOREIGN KEY (claimed_by_user_id) REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX idx_ticket_claimed_by ON support_tickets (claimed_by_user_id);
CREATE INDEX idx_ticket_claimed_at ON support_tickets (claimed_at);

