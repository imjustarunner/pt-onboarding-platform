-- Explicit financial delegation; independent of general organization affiliations.
CREATE TABLE IF NOT EXISTS agency_billing_management (
  agency_id INT NOT NULL,
  manager_agency_id INT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by_user_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (agency_id),
  KEY idx_billing_manager (manager_agency_id, is_active),
  CONSTRAINT fk_billing_managed_agency FOREIGN KEY (agency_id) REFERENCES agencies(id),
  CONSTRAINT fk_billing_manager_agency FOREIGN KEY (manager_agency_id) REFERENCES agencies(id),
  CONSTRAINT fk_billing_manager_actor FOREIGN KEY (created_by_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
