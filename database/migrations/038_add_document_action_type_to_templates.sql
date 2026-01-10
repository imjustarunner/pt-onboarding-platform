-- Migration: Add document_action_type to document_templates
-- Description: Store the document action type (signature/review) on the template so it can't be changed during assignment

ALTER TABLE document_templates
ADD COLUMN document_action_type ENUM('signature', 'review') 
DEFAULT 'signature' 
AFTER document_type;

-- Update existing templates to have 'signature' type
UPDATE document_templates 
SET document_action_type = 'signature' 
WHERE document_action_type IS NULL;

