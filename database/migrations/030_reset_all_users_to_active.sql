-- Migration: Reset all users to active status
-- Description: Set all existing users to 'active' status and clear expiration fields
-- This ensures all users can log in based on the new simplified status parameters

UPDATE users 
SET 
  status = 'active',
  completed_at = NULL,
  terminated_at = NULL,
  status_expires_at = NULL
WHERE status IS NULL OR status != 'active';

-- Also ensure any remaining NULL values are set to active (safety check)
UPDATE users SET status = 'active' WHERE status IS NULL;

