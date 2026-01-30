-- Migration: Add organization_id to document_templates
-- Description: Allow templates to be scoped to an affiliated organization (school/program/learning) within an agency.

ALTER TABLE document_templates
ADD COLUMN organization_id INT NULL AFTER agency_id;

ALTER TABLE document_templates
ADD INDEX idx_document_templates_organization_id (organization_id);

ALTER TABLE document_templates
ADD CONSTRAINT fk_document_templates_organization_id
FOREIGN KEY (organization_id) REFERENCES agencies(id) ON DELETE SET NULL;

