-- Add scan + encryption metadata for client PHI documents
ALTER TABLE client_phi_documents
  ADD COLUMN scan_status VARCHAR(32) NULL AFTER uploaded_by_user_id,
  ADD COLUMN scan_result VARCHAR(512) NULL AFTER scan_status,
  ADD COLUMN scanned_at TIMESTAMP NULL AFTER scan_result,
  ADD COLUMN quarantine_path VARCHAR(1024) NULL AFTER scanned_at,
  ADD COLUMN is_encrypted BOOLEAN NOT NULL DEFAULT FALSE AFTER quarantine_path,
  ADD COLUMN encryption_key_id VARCHAR(512) NULL AFTER is_encrypted,
  ADD COLUMN encryption_wrapped_key TEXT NULL AFTER encryption_key_id,
  ADD COLUMN encryption_iv VARCHAR(128) NULL AFTER encryption_wrapped_key,
  ADD COLUMN encryption_auth_tag VARCHAR(128) NULL AFTER encryption_iv,
  ADD COLUMN encryption_alg VARCHAR(64) NULL AFTER encryption_auth_tag,
  ADD INDEX idx_phi_scan_status (scan_status);
