-- Migration: Add pending access tracking fields
-- Description: Track access locking and notification status for pending users

ALTER TABLE users
ADD COLUMN pending_access_locked BOOLEAN DEFAULT FALSE COMMENT 'Whether pending user access is locked (after completion)' AFTER pending_identity_verified,
ADD COLUMN pending_completion_notified BOOLEAN DEFAULT FALSE COMMENT 'Whether admins have been notified of pending completion' AFTER pending_access_locked;

-- Add index for efficient queries
CREATE INDEX idx_pending_access_locked ON users(pending_access_locked);
