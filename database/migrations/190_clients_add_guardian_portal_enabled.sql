-- Migration: Add guardian portal toggle on clients
-- Description:
-- - Adds a simple switch to indicate that guardian portal access is enabled for this client
-- - Actual access is controlled by rows in client_guardians

ALTER TABLE clients
  ADD COLUMN guardian_portal_enabled TINYINT(1) NOT NULL DEFAULT 0
    COMMENT 'If enabled, guardians may be granted portal access (via client_guardians)' AFTER document_status;

CREATE INDEX idx_clients_guardian_portal_enabled ON clients(guardian_portal_enabled);

