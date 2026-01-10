-- Migration: Make email column nullable for pending users
-- Description: Allow pending users to be created without email addresses. Email will be set when they transition to active status.

-- First, update any existing NULL emails to a placeholder or set them based on work_email if available
-- For users with work_email but NULL email, copy work_email to email
UPDATE users 
SET email = work_email 
WHERE email IS NULL AND work_email IS NOT NULL;

-- For any remaining NULL emails (shouldn't happen in production, but safety check)
-- Set them to a placeholder that won't conflict (using user ID)
UPDATE users 
SET email = CONCAT('user_', id, '@placeholder.local')
WHERE email IS NULL;

-- Drop existing unique constraint/index on email
-- Note: This will fail if index doesn't exist, but the migration script will handle it
ALTER TABLE users DROP INDEX email;

-- Also drop idx_email_unique if it exists (from a previous migration attempt)
ALTER TABLE users DROP INDEX idx_email_unique;

-- Modify the email column to allow NULL values
ALTER TABLE users 
MODIFY COLUMN email VARCHAR(255) NULL;

-- Re-add UNIQUE constraint (MySQL allows multiple NULL values in UNIQUE columns)
-- This ensures email uniqueness for non-NULL values while allowing NULL for pending users
ALTER TABLE users 
ADD UNIQUE INDEX email (email);
