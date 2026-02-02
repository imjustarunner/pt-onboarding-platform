-- Add client-linked + threaded messages for support tickets.
-- This enables School Portal "client messages" to be treated as a ticket thread.

ALTER TABLE support_tickets
  ADD COLUMN client_id INT NULL AFTER school_organization_id;

CREATE INDEX idx_support_tickets_client_school
  ON support_tickets (client_id, school_organization_id);

CREATE TABLE IF NOT EXISTS support_ticket_messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ticket_id INT NOT NULL,
  parent_message_id INT NULL,
  author_user_id INT NULL,
  author_role VARCHAR(50) NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_support_ticket_messages_ticket_id (ticket_id),
  INDEX idx_support_ticket_messages_parent_id (parent_message_id)
);

