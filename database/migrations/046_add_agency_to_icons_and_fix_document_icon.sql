-- Migration: Add agency_id to icons and ensure icon_id exists in document_templates
-- Description: Icons should be associated with either platform (agency_id = NULL) or an agency
-- Rewritten to use plain SQL compatible with MySQL 8.0 and mysql2 prepared statements
-- The migration runner will catch "Duplicate column", "Duplicate key", and "already exists" errors and skip them

-- Add agency_id column to icons table
ALTER TABLE icons
ADD COLUMN agency_id INT NULL AFTER created_by_user_id;

-- Add index on agency_id in icons table
CREATE INDEX idx_icons_agency_id ON icons(agency_id);

-- Add named foreign key constraint for agency_id in icons table
ALTER TABLE icons
ADD CONSTRAINT fk_icons_agency_id
FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE;

-- Add icon_id column to document_templates (if it doesn't exist)
-- Note: If column already exists, the migration runner will catch "Duplicate column" error and skip
ALTER TABLE document_templates
ADD COLUMN icon_id INT NULL AFTER user_id;

-- Add index on icon_id in document_templates
CREATE INDEX idx_document_templates_icon_id ON document_templates(icon_id);

-- Add foreign key constraint for icon_id in document_templates
-- Note: Using a named constraint to avoid conflicts
ALTER TABLE document_templates
ADD CONSTRAINT fk_document_templates_icon_id
FOREIGN KEY (icon_id) REFERENCES icons(id) ON DELETE SET NULL;

-- Set existing icons without agency_id to platform (NULL = platform)
-- This ensures all existing icons are platform icons
UPDATE icons SET agency_id = NULL WHERE agency_id IS NULL;
