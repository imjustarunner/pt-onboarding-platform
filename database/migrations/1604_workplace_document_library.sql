-- Plot Twist CO's managed-company document package. Each company retains its
-- own handbook versions, section edits and publication/update history.
CREATE TABLE IF NOT EXISTS workplace_document_assignments (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  document_key VARCHAR(80) NOT NULL,
  template_version VARCHAR(32) NOT NULL,
  package_key VARCHAR(32) NOT NULL DEFAULT 'basic',
  granted_by_user_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_workplace_document_company (agency_id, document_key),
  CONSTRAINT fk_workplace_document_company FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE RESTRICT,
  CONSTRAINT fk_workplace_document_grant_user FOREIGN KEY (granted_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);
