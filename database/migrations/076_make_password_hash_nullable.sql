-- Migration: Make password_hash column nullable for pending users
-- Description: Allow pending users to be created without passwords. Pending users use passwordless access only.

-- Modify the password_hash column to allow NULL values
ALTER TABLE users 
MODIFY COLUMN password_hash VARCHAR(255) NULL;
