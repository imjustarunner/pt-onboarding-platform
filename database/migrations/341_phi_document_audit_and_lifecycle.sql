-- Audit and lifecycle metadata for PHI documents
CREATE TABLE IF NOT EXISTS phi_document_audit_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  document_id INT NOT NULL,
  client_id INT NULL,
  action VARCHAR(64) NOT NULL,
  actor_user_id INT NULL,
  actor_label VARCHAR(255) NULL,
  ip_address VARCHAR(64) NULL,
  metadata JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (document_id) REFERENCES client_phi_documents(id) ON DELETE CASCADE,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL,
  FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_phi_doc_audit_doc (document_id),
  INDEX idx_phi_doc_audit_client (client_id),
  INDEX idx_phi_doc_audit_created (created_at)
);

ALTER TABLE client_phi_documents
  ADD COLUMN exported_to_ehr_at TIMESTAMP NULL AFTER encryption_alg,
  ADD COLUMN exported_to_ehr_by_user_id INT NULL AFTER exported_to_ehr_at,
  ADD COLUMN removed_at TIMESTAMP NULL AFTER exported_to_ehr_by_user_id,
  ADD COLUMN removed_by_user_id INT NULL AFTER removed_at,
  ADD COLUMN removed_reason VARCHAR(255) NULL AFTER removed_by_user_id,
  ADD INDEX idx_phi_removed_at (removed_at),
  ADD INDEX idx_phi_exported_at (exported_to_ehr_at),
  ADD CONSTRAINT fk_phi_exported_by FOREIGN KEY (exported_to_ehr_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_phi_removed_by FOREIGN KEY (removed_by_user_id) REFERENCES users(id) ON DELETE SET NULL;
