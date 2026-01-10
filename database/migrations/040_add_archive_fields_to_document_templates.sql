-- Migration: Add archive fields to document_templates table
-- Description: Add is_archived and archived_at fields to support soft deletion

-- Add archive fields to document_templates
ALTER TABLE document_templates
ADD COLUMN is_archived BOOLEAN DEFAULT FALSE AFTER is_active,
ADD COLUMN archived_at TIMESTAMP NULL DEFAULT NULL AFTER is_archived,
ADD COLUMN archived_by_user_id INT NULL DEFAULT NULL AFTER archived_at;

-- Add index for is_archived on document_templates
CREATE INDEX idx_document_templates_is_archived ON document_templates(is_archived);

-- Add foreign key constraint for archived_by_user_id
ALTER TABLE document_templates
ADD CONSTRAINT fk_document_templates_archived_by
FOREIGN KEY (archived_by_user_id) REFERENCES users(id) ON DELETE SET NULL;

