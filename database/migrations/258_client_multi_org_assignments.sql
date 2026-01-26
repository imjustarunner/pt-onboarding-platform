-- Support clients belonging to multiple organizations (school/program/learning) while remaining owned by one agency.
-- Legacy compatibility: clients.organization_id remains the primary org, but additional affiliations live here.

CREATE TABLE IF NOT EXISTS client_organization_assignments (
  client_id INT NOT NULL,
  organization_id INT NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (client_id, organization_id),
  INDEX idx_client_org_org (organization_id, is_active),
  INDEX idx_client_org_client (client_id, is_active),
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id) REFERENCES agencies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Backfill primary affiliation from legacy column (best-effort; idempotent).
INSERT INTO client_organization_assignments (client_id, organization_id, is_primary, is_active)
SELECT c.id, c.organization_id, TRUE, TRUE
FROM clients c
WHERE c.organization_id IS NOT NULL
ON DUPLICATE KEY UPDATE
  is_primary = TRUE,
  is_active = TRUE;

