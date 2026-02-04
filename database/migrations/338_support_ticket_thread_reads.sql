-- Migration: support ticket thread read tracking (school portal)
-- Description: Track per-user read position for client-scoped support ticket threads
-- so we can show unread message counts and clear them on view.

CREATE TABLE IF NOT EXISTS support_ticket_thread_reads (
  school_organization_id INT NOT NULL,
  client_id INT NOT NULL,
  user_id INT NOT NULL,
  last_read_at TIMESTAMP NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (school_organization_id, client_id, user_id),
  INDEX idx_user (user_id),
  INDEX idx_org_client (school_organization_id, client_id)
);

