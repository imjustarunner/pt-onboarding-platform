-- Migration: Add archived_by_agency_id to archive tables
-- Description: Track which agency archived each item to enforce agency-scoped archive management
-- Rewritten to use plain SQL compatible with mysql2 prepared statements (no PREPARE/EXECUTE)

-- Add archived_by_agency_id to training_tracks
ALTER TABLE training_tracks
ADD COLUMN archived_by_agency_id INT NULL DEFAULT NULL AFTER archived_by_user_id;

-- Add foreign key constraint for training_tracks
ALTER TABLE training_tracks
ADD CONSTRAINT fk_training_tracks_archived_by_agency
FOREIGN KEY (archived_by_agency_id) REFERENCES agencies(id) ON DELETE SET NULL;

-- Add index for filtering on training_tracks
CREATE INDEX idx_training_tracks_archived_by_agency ON training_tracks(archived_by_agency_id);

-- Add archived_by_agency_id to modules
ALTER TABLE modules
ADD COLUMN archived_by_agency_id INT NULL DEFAULT NULL AFTER archived_by_user_id;

-- Add foreign key constraint for modules
ALTER TABLE modules
ADD CONSTRAINT fk_modules_archived_by_agency
FOREIGN KEY (archived_by_agency_id) REFERENCES agencies(id) ON DELETE SET NULL;

-- Add index for filtering on modules
CREATE INDEX idx_modules_archived_by_agency ON modules(archived_by_agency_id);

-- Add archived_by_agency_id to users
ALTER TABLE users
ADD COLUMN archived_by_agency_id INT NULL DEFAULT NULL AFTER archived_by_user_id;

-- Add foreign key constraint for users
ALTER TABLE users
ADD CONSTRAINT fk_users_archived_by_agency
FOREIGN KEY (archived_by_agency_id) REFERENCES agencies(id) ON DELETE SET NULL;

-- Add index for filtering on users
CREATE INDEX idx_users_archived_by_agency ON users(archived_by_agency_id);

-- Add archived_by_agency_id to document_templates (if table exists)
-- Note: If column already exists, the migration runner will catch "Duplicate column" error and skip
ALTER TABLE document_templates
ADD COLUMN archived_by_agency_id INT NULL DEFAULT NULL AFTER archived_by_user_id;

-- Add foreign key constraint for document_templates
ALTER TABLE document_templates
ADD CONSTRAINT fk_document_templates_archived_by_agency
FOREIGN KEY (archived_by_agency_id) REFERENCES agencies(id) ON DELETE SET NULL;

-- Add index for filtering on document_templates
CREATE INDEX idx_document_templates_archived_by_agency ON document_templates(archived_by_agency_id);
