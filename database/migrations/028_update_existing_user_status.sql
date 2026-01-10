-- Migration: Update existing users with NULL status to 'active'
-- Description: Ensure all existing users have a status value

UPDATE users SET status = 'active' WHERE status IS NULL;

