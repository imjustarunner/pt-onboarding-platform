-- Migration 875: Create hiring_signer_roles table for multi-signer contract workflow
CREATE TABLE hiring_signer_roles (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  agency_id       INT NOT NULL,
  role_label      VARCHAR(100) NOT NULL  COMMENT 'Display name for this signer role, e.g. Hiring Manager',
  default_user_id INT NULL               COMMENT 'Default staff member assigned to this role; can be overridden per hire',
  sort_order      TINYINT NOT NULL DEFAULT 0 COMMENT 'Display order in the Mark Hired modal',
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (agency_id)       REFERENCES agencies(id) ON DELETE CASCADE,
  FOREIGN KEY (default_user_id) REFERENCES users(id)    ON DELETE SET NULL,
  INDEX idx_hiring_signer_roles_agency (agency_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
