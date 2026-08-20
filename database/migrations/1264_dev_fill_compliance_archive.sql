-- Migration 1264: Dev Fill flags, creation audit log, and compliance archive for real deletions

ALTER TABLE clients
  ADD COLUMN created_via_dev_fill TINYINT(1) NOT NULL DEFAULT 0
    COMMENT '1 = created via staff Dev Fill on intake; may be permanently deleted',
  ADD COLUMN compliance_archived_at TIMESTAMP NULL DEFAULT NULL
    COMMENT 'When set, client was compliance-deleted and cannot be permanently removed',
  ADD COLUMN compliance_archived_by_user_id INT NULL DEFAULT NULL
    COMMENT 'Staff user who compliance-archived this client';

ALTER TABLE users
  ADD COLUMN created_via_dev_fill TINYINT(1) NOT NULL DEFAULT 0
    COMMENT '1 = guardian created via staff Dev Fill; may be permanently deleted',
  ADD COLUMN compliance_archived_at TIMESTAMP NULL DEFAULT NULL
    COMMENT 'When set, guardian was compliance-deleted and cannot be permanently removed',
  ADD COLUMN compliance_archived_by_user_id INT NULL DEFAULT NULL
    COMMENT 'Staff user who compliance-archived this guardian';

CREATE INDEX idx_clients_created_via_dev_fill ON clients (created_via_dev_fill);
CREATE INDEX idx_clients_compliance_archived_at ON clients (compliance_archived_at);
CREATE INDEX idx_users_created_via_dev_fill ON users (created_via_dev_fill);
CREATE INDEX idx_users_compliance_archived_at ON users (compliance_archived_at);

CREATE TABLE dev_fill_creation_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  actor_user_id INT NOT NULL,
  agency_id INT NULL DEFAULT NULL,
  entity_type ENUM('client', 'guardian') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  entity_id INT NOT NULL,
  intake_submission_id INT NULL DEFAULT NULL,
  source VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL
    COMMENT 'e.g. PUBLIC_INTAKE_LINK, ADAPTIVE_QUICK_PROSPECTIVE',
  metadata JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_dev_fill_log_actor (actor_user_id),
  INDEX idx_dev_fill_log_agency (agency_id),
  INDEX idx_dev_fill_log_entity (entity_type, entity_id),
  INDEX idx_dev_fill_log_created (created_at),
  CONSTRAINT fk_dev_fill_log_actor FOREIGN KEY (actor_user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_dev_fill_log_agency FOREIGN KEY (agency_id) REFERENCES agencies (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
