-- Migration: Create user compliance/credential documents table
-- Purpose: Track expiring credentials (licenses, insurance, TB tests, etc.)

CREATE TABLE IF NOT EXISTS user_compliance_documents (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  agency_id INT NULL,
  document_type VARCHAR(100) NOT NULL COMMENT 'e.g., license, insurance, tb_test, etc.',
  expiration_date DATE NULL,
  is_blocking BOOLEAN NOT NULL DEFAULT FALSE,
  file_path VARCHAR(500) NULL COMMENT 'GCS object key (e.g., credentials/...)',
  notes TEXT NULL,
  uploaded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by_user_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_user (user_id),
  INDEX idx_agency (agency_id),
  INDEX idx_expiration (expiration_date),
  INDEX idx_blocking (is_blocking)
);

