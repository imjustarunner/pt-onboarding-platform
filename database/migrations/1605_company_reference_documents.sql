-- Versioned in-app manuals in the company document package. The workplace
-- handbook keeps its existing tables and acknowledgment/update workflow.
CREATE TABLE IF NOT EXISTS company_reference_documents (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  document_key VARCHAR(80) NOT NULL,
  published_version_id INT NULL,
  draft_version_id INT NULL,
  UNIQUE KEY uq_company_reference_key (agency_id, document_key),
  CONSTRAINT fk_company_reference_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS company_reference_versions (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  document_id INT NOT NULL,
  version_number INT NOT NULL,
  revision INT NOT NULL DEFAULT 1,
  is_draft TINYINT(1) NOT NULL DEFAULT 1,
  metadata_json JSON NOT NULL,
  sections_json JSON NOT NULL,
  changes_json JSON NULL,
  created_by_user_id INT NULL,
  published_by_user_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  published_at TIMESTAMP NULL,
  UNIQUE KEY uq_company_reference_version (document_id, version_number),
  CONSTRAINT fk_company_reference_version_document FOREIGN KEY (document_id) REFERENCES company_reference_documents(id) ON DELETE RESTRICT,
  CONSTRAINT fk_company_reference_creator FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_company_reference_publisher FOREIGN KEY (published_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);
