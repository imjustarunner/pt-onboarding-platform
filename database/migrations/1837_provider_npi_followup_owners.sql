-- Credentialing permission and NPI workflow ownership are separate decisions.
-- Populate operational routing explicitly; never assign everyone with access.
CREATE TABLE IF NOT EXISTS provider_npi_followup_owners (
  agency_id INT NOT NULL PRIMARY KEY,
  user_id INT NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_npi_owner_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_npi_owner_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_npi_owner_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
