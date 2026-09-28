-- Reviewed fax intake; drafts contain only encrypted payloads and non-PHI metadata.
CREATE TABLE IF NOT EXISTS fax_intake_drafts (
  id CHAR(36) PRIMARY KEY,
  agency_id INT NOT NULL,
  organization_id INT NOT NULL,
  created_by_user_id INT NOT NULL,
  payload_encrypted LONGBLOB NULL,
  encryption_metadata JSON NULL,
  client_id INT NULL,
  expires_at DATETIME NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (agency_id) REFERENCES agencies(id),
  FOREIGN KEY (organization_id) REFERENCES agencies(id),
  FOREIGN KEY (created_by_user_id) REFERENCES users(id),
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL,
  INDEX idx_fax_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE referral_directory_entries
  ADD COLUMN fax VARCHAR(40) NULL,
  ADD COLUMN source_url VARCHAR(500) NULL;

CREATE TABLE IF NOT EXISTS client_referral_links (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  client_id INT NOT NULL,
  entry_id INT NOT NULL,
  direction ENUM('incoming','outgoing') NOT NULL,
  referral_date DATE NULL,
  phi_document_id INT NULL,
  created_by_user_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (agency_id) REFERENCES agencies(id),
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  FOREIGN KEY (entry_id) REFERENCES referral_directory_entries(id),
  FOREIGN KEY (phi_document_id) REFERENCES client_phi_documents(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id),
  UNIQUE KEY uq_client_referral (client_id, entry_id, direction),
  INDEX idx_referral_directory_clients (agency_id, entry_id, direction)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
