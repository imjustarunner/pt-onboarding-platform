-- Migration: Client multi-agency affiliations
-- Description: Allows a client to be affiliated with multiple agencies (one primary).

CREATE TABLE IF NOT EXISTS client_agency_assignments (
  client_id INT NOT NULL,
  agency_id INT NOT NULL COMMENT 'agencies.id where organization_type=agency',
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (client_id, agency_id),
  INDEX idx_client_agency_active (agency_id, is_active),
  INDEX idx_client_agency_client (client_id, is_active),
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Backfill from legacy clients.agency_id
INSERT INTO client_agency_assignments (client_id, agency_id, is_primary, is_active)
SELECT c.id, c.agency_id, TRUE, TRUE
FROM clients c
WHERE c.agency_id IS NOT NULL
ON DUPLICATE KEY UPDATE is_primary = VALUES(is_primary), is_active = VALUES(is_active);

