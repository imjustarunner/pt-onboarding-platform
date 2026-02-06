-- Add title/type fields for PHI documents

ALTER TABLE client_phi_documents
  ADD COLUMN document_title VARCHAR(255) NULL AFTER original_name,
  ADD COLUMN document_type VARCHAR(80) NULL AFTER document_title;
