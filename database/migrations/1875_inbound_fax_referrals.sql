CREATE TABLE fax_referral_inbox (
  id CHAR(36) PRIMARY KEY,
  agency_id INT NOT NULL,
  receiving_number VARCHAR(16) NOT NULL,
  carrier_receipt VARCHAR(150) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  state ENUM('pending','review','filtered','referral','linked') NOT NULL DEFAULT 'pending',
  reason VARCHAR(32) NULL,
  attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
  retry_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lease_token CHAR(36) NULL,
  received_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  payload_encrypted LONGBLOB NULL,
  encryption_metadata JSON NULL,
  ticket_id INT NULL,
  client_id INT NULL,
  referral_entry_id INT NULL,
  phi_document_id INT NULL,
  reviewed_by_user_id INT NULL,
  reviewed_at DATETIME NULL,
  UNIQUE KEY uq_fax_referral_carrier (receiving_number, carrier_receipt),
  UNIQUE KEY uq_fax_referral_ticket (ticket_id),
  KEY idx_fax_referral_worker (state,retry_at),
  KEY idx_fax_referral_review (agency_id,state,received_at),
  KEY idx_fax_referral_client (client_id),
  FOREIGN KEY (agency_id) REFERENCES agencies(id),
  FOREIGN KEY (ticket_id) REFERENCES support_tickets(id) ON DELETE SET NULL,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL,
  FOREIGN KEY (referral_entry_id) REFERENCES referral_directory_entries(id) ON DELETE SET NULL,
  FOREIGN KEY (phi_document_id) REFERENCES client_phi_documents(id) ON DELETE SET NULL,
  FOREIGN KEY (reviewed_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE fax_intake_drafts
  ADD COLUMN fax_referral_id CHAR(36) NULL,
  ADD CONSTRAINT fk_fax_review_receipt FOREIGN KEY (fax_referral_id) REFERENCES fax_referral_inbox(id);

CREATE TABLE fax_referral_document_access (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  fax_referral_id CHAR(36) NOT NULL,
  user_id INT NULL,
  action ENUM('document','review_draft') NOT NULL,
  accessed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (fax_referral_id) REFERENCES fax_referral_inbox(id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  KEY idx_fax_referral_document_access (fax_referral_id, accessed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
