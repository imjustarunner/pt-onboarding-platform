-- Migration: Enforce NOT NULL constraint on status column
-- Description: Ensure status column cannot be NULL at the database level

-- First, ensure all existing NULL values are set to 'active'
UPDATE users SET status = 'active' WHERE status IS NULL;

-- Modify the column to be NOT NULL with DEFAULT 'active'
ALTER TABLE users 
MODIFY COLUMN status ENUM('active', 'completed', 'terminated') NOT NULL DEFAULT 'active';

