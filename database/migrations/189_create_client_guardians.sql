-- Migration: Create client_guardians link table (guardian portal accounts)
-- Description:
-- - Links portal guardian user accounts to client records
-- - Supports multiple guardians per client (e.g., divorced guardians)
-- - Stores relationship title and permission flags (non-clinical portal access)

CREATE TABLE IF NOT EXISTS client_guardians (
  id INT AUTO_INCREMENT PRIMARY KEY,
  client_id INT NOT NULL,
  guardian_user_id INT NOT NULL,
  relationship_title VARCHAR(100) NOT NULL DEFAULT 'Guardian',
  access_enabled TINYINT(1) NOT NULL DEFAULT 1,
  -- Permissions are intentionally non-clinical (docs, links, program materials, progress)
  -- Store as JSON to keep this flexible without migration churn.
  permissions_json JSON NULL,
  created_by_user_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  UNIQUE KEY uq_client_guardian (client_id, guardian_user_id),
  INDEX idx_client_guardians_client (client_id),
  INDEX idx_client_guardians_guardian (guardian_user_id),

  CONSTRAINT fk_client_guardians_client
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  CONSTRAINT fk_client_guardians_guardian
    FOREIGN KEY (guardian_user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_client_guardians_created_by
    FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

