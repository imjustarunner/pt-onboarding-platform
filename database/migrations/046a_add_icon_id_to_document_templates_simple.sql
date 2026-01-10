-- Migration: Add icon_id to document_templates (simplified version)
-- Description: Adds icon_id column to document_templates if it doesn't exist

-- Add icon_id column if it doesn't exist (using a simple approach)
-- First, try to add it - if it fails because it exists, that's okay
ALTER TABLE document_templates 
ADD COLUMN icon_id INT NULL AFTER user_id;

-- Add foreign key constraint if it doesn't exist
ALTER TABLE document_templates 
ADD CONSTRAINT document_templates_ibfk_icon_id 
FOREIGN KEY (icon_id) REFERENCES icons(id) ON DELETE SET NULL;

-- Add index if it doesn't exist
ALTER TABLE document_templates 
ADD INDEX idx_icon (icon_id);

