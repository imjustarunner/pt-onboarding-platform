-- Migration: Remove temporary password functionality
-- Description: Remove temporary_password_hash and temporary_password_expires_at columns from users table
-- Also remove temporary_password column from user_accounts table if it exists

-- Remove temporary password columns from users table
ALTER TABLE users
DROP COLUMN IF EXISTS temporary_password_hash,
DROP COLUMN IF EXISTS temporary_password_expires_at;

-- Remove temporary_password column from user_accounts table if it exists
ALTER TABLE user_accounts
DROP COLUMN IF EXISTS temporary_password;
