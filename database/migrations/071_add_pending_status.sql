-- Migration: Add pending and ready_for_review status to users
-- Description: Support pre-onboarding offer-to-hire workflow with pending status

-- First, update existing NULL values to 'active' if any exist
UPDATE users SET status = 'active' WHERE status IS NULL;

-- Modify the status ENUM to include 'pending' and 'ready_for_review'
ALTER TABLE users 
MODIFY COLUMN status ENUM('active', 'completed', 'terminated', 'pending', 'ready_for_review') NOT NULL DEFAULT 'active';

-- Add pending completion tracking fields
ALTER TABLE users
ADD COLUMN pending_completed_at TIMESTAMP NULL COMMENT 'Timestamp when pending hiring process was completed' AFTER status_expires_at,
ADD COLUMN pending_auto_complete_at TIMESTAMP NULL COMMENT 'Timestamp when pending will auto-complete (24 hours after last checklist item)' AFTER pending_completed_at,
ADD COLUMN pending_identity_verified BOOLEAN DEFAULT FALSE COMMENT 'Whether last name identity verification has been completed' AFTER pending_auto_complete_at;

-- Add indexes for efficient queries
CREATE INDEX idx_pending_status ON users(status);
CREATE INDEX idx_pending_completed_at ON users(pending_completed_at);
CREATE INDEX idx_pending_auto_complete_at ON users(pending_auto_complete_at);
