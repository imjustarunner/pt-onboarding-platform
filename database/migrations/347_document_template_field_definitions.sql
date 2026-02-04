ALTER TABLE document_templates
  ADD COLUMN field_definitions JSON NULL;

ALTER TABLE user_specific_documents
  ADD COLUMN field_definitions JSON NULL;
