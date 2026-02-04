-- Public intake links and submissions (multi-use digital link)
CREATE TABLE IF NOT EXISTS intake_links (
  id INT AUTO_INCREMENT PRIMARY KEY,
  public_key VARCHAR(64) NOT NULL,
  title VARCHAR(255) NULL,
  description TEXT NULL,
  scope_type ENUM('agency', 'school', 'program') NOT NULL DEFAULT 'agency',
  organization_id INT NULL,
  program_id INT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  create_client BOOLEAN NOT NULL DEFAULT TRUE,
  create_guardian BOOLEAN NOT NULL DEFAULT FALSE,
  allowed_document_template_ids JSON NULL,
  created_by_user_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_intake_public_key (public_key),
  INDEX idx_intake_scope (scope_type, organization_id),
  INDEX idx_intake_program (program_id),
  FOREIGN KEY (organization_id) REFERENCES agencies(id) ON DELETE SET NULL,
  FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS intake_submissions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  intake_link_id INT NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'started',
  signer_name VARCHAR(255) NULL,
  signer_initials VARCHAR(32) NULL,
  signer_email VARCHAR(255) NULL,
  signer_phone VARCHAR(64) NULL,
  consent_given_at TIMESTAMP NULL,
  submitted_at TIMESTAMP NULL,
  ip_address VARCHAR(64) NULL,
  user_agent VARCHAR(512) NULL,
  client_id INT NULL,
  guardian_user_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_intake_submission_link (intake_link_id),
  INDEX idx_intake_submission_status (status),
  INDEX idx_intake_submission_client (client_id),
  FOREIGN KEY (intake_link_id) REFERENCES intake_links(id) ON DELETE CASCADE,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL,
  FOREIGN KEY (guardian_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS intake_submission_documents (
  id INT AUTO_INCREMENT PRIMARY KEY,
  intake_submission_id INT NOT NULL,
  document_template_id INT NOT NULL,
  signed_pdf_path VARCHAR(1024) NULL,
  pdf_hash VARCHAR(128) NULL,
  signed_at TIMESTAMP NULL,
  audit_trail JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_intake_submission_doc (intake_submission_id),
  INDEX idx_intake_submission_template (document_template_id),
  FOREIGN KEY (intake_submission_id) REFERENCES intake_submissions(id) ON DELETE CASCADE,
  FOREIGN KEY (document_template_id) REFERENCES document_templates(id) ON DELETE RESTRICT
);
