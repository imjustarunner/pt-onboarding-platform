-- Migration: Track PHI documents/packets for clients
-- Description: Stores referral packet file metadata and OCR-extracted fields separately (limited fields only).

CREATE TABLE IF NOT EXISTS client_phi_documents (
  id INT AUTO_INCREMENT PRIMARY KEY,
  client_id INT NOT NULL,
  agency_id INT NOT NULL,
  school_organization_id INT NOT NULL,
  storage_path VARCHAR(1024) NOT NULL COMMENT 'GCS object path (e.g., referrals/<schoolId>/...)',
  original_name VARCHAR(512) NULL,
  mime_type VARCHAR(128) NULL,
  is_phi BOOLEAN NOT NULL DEFAULT TRUE,
  ocr_extracted_fields JSON NULL,
  ocr_processed_at TIMESTAMP NULL,
  uploaded_by_user_id INT NULL,
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE RESTRICT,
  FOREIGN KEY (school_organization_id) REFERENCES agencies(id) ON DELETE RESTRICT,
  FOREIGN KEY (uploaded_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE KEY uniq_phi_storage_path (storage_path(255)),
  INDEX idx_phi_client (client_id),
  INDEX idx_phi_agency (agency_id),
  INDEX idx_phi_school (school_organization_id),
  INDEX idx_phi_uploaded_at (uploaded_at)
);

