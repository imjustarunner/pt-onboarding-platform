-- Migration: school public documents (school portal shared library)
-- Purpose: allow each school to manage a shared set of non-PHI documents (calendars, bell schedules, etc).

CREATE TABLE IF NOT EXISTS school_public_documents (
  id INT AUTO_INCREMENT PRIMARY KEY,
  school_organization_id INT NOT NULL,
  title VARCHAR(255) NULL,
  category_key VARCHAR(64) NULL,
  file_path VARCHAR(512) NOT NULL,
  mime_type VARCHAR(128) NULL,
  original_filename VARCHAR(255) NULL,
  uploaded_by_user_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_school_public_documents_school (school_organization_id),
  CONSTRAINT fk_school_public_documents_school FOREIGN KEY (school_organization_id) REFERENCES agencies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

