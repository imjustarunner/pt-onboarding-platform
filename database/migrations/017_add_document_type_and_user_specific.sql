-- Migration: Add document type and user-specific document support
-- Description: Add document_type enum, is_user_specific flag, and user_id for user-specific documents

ALTER TABLE document_templates
ADD COLUMN document_type ENUM(
  'acknowledgment', 
  'authorization', 
  'agreement', 
  'compliance', 
  'disclosure', 
  'consent', 
  'administrative'
) DEFAULT 'administrative' AFTER template_type,
ADD COLUMN is_user_specific BOOLEAN DEFAULT FALSE AFTER document_type,
ADD COLUMN user_id INT NULL AFTER is_user_specific,
ADD INDEX idx_document_type (document_type),
ADD INDEX idx_is_user_specific (is_user_specific),
ADD INDEX idx_user_id (user_id),
ADD FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- Update existing documents to have default document_type
UPDATE document_templates 
SET document_type = 'administrative' 
WHERE document_type IS NULL;

