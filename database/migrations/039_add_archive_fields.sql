-- Migration: Add archive fields to training_tracks, modules, and users tables
-- Description: Add is_archived and archived_at fields to support soft deletion
-- Rewritten to use plain SQL compatible with mysql2 prepared statements (no PREPARE/EXECUTE)
-- The migration runner will catch "Duplicate column", "Duplicate key", and "Duplicate foreign key" errors and skip them

-- Add archive fields to training_tracks
ALTER TABLE training_tracks
ADD COLUMN is_archived BOOLEAN DEFAULT FALSE AFTER is_active,
ADD COLUMN archived_at TIMESTAMP NULL DEFAULT NULL AFTER is_archived,
ADD COLUMN archived_by_user_id INT NULL DEFAULT NULL AFTER archived_at;

-- Add index for is_archived on training_tracks
CREATE INDEX idx_training_tracks_is_archived ON training_tracks(is_archived);

-- Add archive fields to modules
ALTER TABLE modules
ADD COLUMN is_archived BOOLEAN DEFAULT FALSE AFTER is_active,
ADD COLUMN archived_at TIMESTAMP NULL DEFAULT NULL AFTER is_archived,
ADD COLUMN archived_by_user_id INT NULL DEFAULT NULL AFTER archived_at;

-- Add index for is_archived on modules
CREATE INDEX idx_modules_is_archived ON modules(is_archived);

-- Add archive fields to users
ALTER TABLE users
ADD COLUMN is_archived BOOLEAN DEFAULT FALSE AFTER status,
ADD COLUMN archived_at TIMESTAMP NULL DEFAULT NULL AFTER is_archived,
ADD COLUMN archived_by_user_id INT NULL DEFAULT NULL AFTER archived_at;

-- Add index for is_archived on users
CREATE INDEX idx_users_is_archived ON users(is_archived);

-- Add foreign key constraints for archived_by_user_id
-- Note: If these constraints already exist, the migration runner will catch ER_FK_DUP_NAME and skip them
ALTER TABLE training_tracks
ADD CONSTRAINT fk_training_tracks_archived_by
FOREIGN KEY (archived_by_user_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE modules
ADD CONSTRAINT fk_modules_archived_by
FOREIGN KEY (archived_by_user_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE users
ADD CONSTRAINT fk_users_archived_by
FOREIGN KEY (archived_by_user_id) REFERENCES users(id) ON DELETE SET NULL;
