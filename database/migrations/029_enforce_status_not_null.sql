-- Migration: Enforce NOT NULL constraint on status column
-- Description: Ensure status column cannot be NULL at the database level
-- This migration is idempotent and safe to run on existing databases with mixed legacy status values

-- Step 1: First, temporarily expand ENUM to include all possible legacy values
-- This allows us to update invalid values without errors
ALTER TABLE users 
MODIFY COLUMN status ENUM('active', 'completed', 'terminated', 'pending', 'ready_for_review') DEFAULT 'active';

-- Step 2: Set any NULL status values to 'active'
UPDATE users SET status = 'active' WHERE status IS NULL;

-- Step 3: Set any invalid status values (not in the allowed ENUM) to 'active'
-- This handles legacy status values that don't match the new ENUM definition
UPDATE users 
SET status = 'active' 
WHERE status IS NOT NULL 
  AND status NOT IN ('active', 'completed', 'terminated');

-- Step 4: Modify the column to be NOT NULL with DEFAULT 'active' and restrict to allowed values
-- This will only succeed if all existing values are valid ENUM values
ALTER TABLE users 
MODIFY COLUMN status ENUM('active', 'completed', 'terminated') NOT NULL DEFAULT 'active';
