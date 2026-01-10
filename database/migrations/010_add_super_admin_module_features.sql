-- Migration: Add Super Admin module features
-- Description: Add agency_id, is_shared, source_module_id, created_by_user_id to modules table

ALTER TABLE modules
ADD COLUMN agency_id INT NULL AFTER description,
ADD COLUMN is_shared BOOLEAN DEFAULT FALSE AFTER agency_id,
ADD COLUMN source_module_id INT NULL AFTER is_shared,
ADD COLUMN created_by_user_id INT NULL AFTER source_module_id,
ADD FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE SET NULL,
ADD FOREIGN KEY (source_module_id) REFERENCES modules(id) ON DELETE SET NULL,
ADD FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
ADD INDEX idx_agency (agency_id),
ADD INDEX idx_shared (is_shared),
ADD INDEX idx_source_module (source_module_id),
ADD INDEX idx_created_by (created_by_user_id);

-- Update existing modules: Set agency_id to NULL for platform-level modules
-- (Existing modules without agency assignment become platform-level)
UPDATE modules SET agency_id = NULL WHERE agency_id IS NULL;

