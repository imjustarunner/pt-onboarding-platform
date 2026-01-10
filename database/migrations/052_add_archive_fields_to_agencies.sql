-- Migration: Add archive fields to agencies table
-- Description: Add is_archived, archived_at, and archived_by_user_id fields to support soft deletion

-- Add archive fields to agencies
ALTER TABLE agencies
ADD COLUMN is_archived BOOLEAN DEFAULT FALSE AFTER is_active,
ADD COLUMN archived_at TIMESTAMP NULL DEFAULT NULL AFTER is_archived,
ADD COLUMN archived_by_user_id INT NULL DEFAULT NULL AFTER archived_at;

-- Add index for is_archived on agencies
CREATE INDEX idx_agencies_is_archived ON agencies(is_archived);

-- Add foreign key constraint for archived_by_user_id
ALTER TABLE agencies
ADD CONSTRAINT fk_agencies_archived_by
FOREIGN KEY (archived_by_user_id) REFERENCES users(id) ON DELETE SET NULL;

