-- Migration: Create form_specs table
-- Purpose: Store spec-driven form definitions (YAML) in the database so Cloud Run does not depend on repo files.

CREATE TABLE IF NOT EXISTS form_specs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  spec_key VARCHAR(128) NOT NULL,
  content MEDIUMTEXT NOT NULL,
  content_sha256 CHAR(64) NOT NULL,
  created_by_user_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_form_specs_key (spec_key)
);

