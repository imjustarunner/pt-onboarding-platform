-- Support multiple providers per client, scoped to the client+organization context.
-- This is used for school + program splits (org-scoped assignment and days).

CREATE TABLE IF NOT EXISTS client_provider_assignments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  client_id INT NOT NULL,
  organization_id INT NOT NULL,
  provider_user_id INT NOT NULL,
  service_day ENUM('Monday','Tuesday','Wednesday','Thursday','Friday') NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by_user_id INT NULL,
  updated_by_user_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_client_org_provider (client_id, organization_id, provider_user_id),
  INDEX idx_client_provider_client (client_id, is_active),
  INDEX idx_client_provider_org (organization_id, is_active),
  INDEX idx_client_provider_provider (provider_user_id, is_active),
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id) REFERENCES agencies(id) ON DELETE CASCADE,
  FOREIGN KEY (provider_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Backfill from legacy single-provider columns (best-effort; idempotent).
-- NOTE: We do NOT adjust provider_school_assignments slots here.
INSERT INTO client_provider_assignments
  (client_id, organization_id, provider_user_id, service_day, is_active, created_by_user_id, updated_by_user_id)
SELECT
  c.id,
  c.organization_id,
  c.provider_id,
  c.service_day,
  TRUE,
  c.created_by_user_id,
  c.updated_by_user_id
FROM clients c
WHERE c.organization_id IS NOT NULL
  AND c.provider_id IS NOT NULL
ON DUPLICATE KEY UPDATE
  service_day = VALUES(service_day),
  is_active = TRUE,
  updated_by_user_id = VALUES(updated_by_user_id);

