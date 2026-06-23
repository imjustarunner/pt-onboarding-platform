-- Migration 874: Add document_stage to document_templates for lifecycle categorization
ALTER TABLE document_templates
  ADD COLUMN document_stage VARCHAR(50) NULL DEFAULT NULL
  COMMENT 'Lifecycle stage tag: pre_hire, onboarding, ongoing, or NULL for general use';

CREATE INDEX idx_document_templates_stage ON document_templates(document_stage);
