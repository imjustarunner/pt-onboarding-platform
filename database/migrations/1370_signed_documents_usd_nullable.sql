-- Migration 1370: allow signed_documents without a library template (user-specific / generated contracts)

ALTER TABLE signed_documents
  MODIFY COLUMN document_template_id INT NULL
  COMMENT 'Library template when signing a document_templates row; NULL for user-specific / generated contracts';

ALTER TABLE signed_documents
  ADD COLUMN user_specific_document_id INT NULL
  COMMENT 'user_specific_documents.id when the signed artifact came from a generated/personal contract'
  AFTER user_document_id;

ALTER TABLE signed_documents
  ADD CONSTRAINT fk_signed_documents_user_specific_document_id
    FOREIGN KEY (user_specific_document_id) REFERENCES user_specific_documents(id) ON DELETE SET NULL;
