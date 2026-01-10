-- Migration: Add is_active field to users table
-- Description: Add is_active field to allow deactivating users without archiving them
-- Rewritten to use plain SQL compatible with MySQL 8.0 (no IF NOT EXISTS)
-- The migration runner will catch "Duplicate column" errors and skip them

-- Add is_active column
ALTER TABLE users 
ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE AFTER status;

-- Add index for is_active
CREATE INDEX idx_is_active ON users(is_active);

-- Set all existing users to active by default (in case of NULL values)
UPDATE users SET is_active = TRUE WHERE is_active IS NULL;
