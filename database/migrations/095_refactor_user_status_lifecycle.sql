-- Migration: Refactor user status lifecycle system
-- Description: Update status ENUM to new lifecycle values and add termination_date field

-- Step 1: Add termination_date field if it doesn't exist
-- Copy from terminated_at if available
-- Note: Migration runner will ignore "already exists" errors
ALTER TABLE users
ADD COLUMN termination_date TIMESTAMP NULL COMMENT 'Date when user was terminated' AFTER terminated_at;

-- Populate termination_date from terminated_at for existing terminated users
UPDATE users 
SET termination_date = terminated_at 
WHERE terminated_at IS NOT NULL AND termination_date IS NULL;

-- Add index on termination_date
-- Note: Migration runner will ignore "already exists" errors
CREATE INDEX idx_termination_date ON users(termination_date);

-- Step 2: Modify status ENUM to new values
-- Note: MySQL requires dropping and recreating the column to change ENUM values
-- We'll use a temporary column approach for safety

-- Add temporary column with new ENUM
ALTER TABLE users
ADD COLUMN status_new ENUM(
  'PENDING_SETUP',
  'PREHIRE_OPEN',
  'PREHIRE_REVIEW',
  'ONBOARDING',
  'ACTIVE_EMPLOYEE',
  'TERMINATED_PENDING',
  'ARCHIVED'
) NOT NULL DEFAULT 'PENDING_SETUP' AFTER status;

-- Step 3: Map existing statuses to new values in the temporary column
-- Map pending to PREHIRE_OPEN
UPDATE users SET status_new = 'PREHIRE_OPEN' WHERE status = 'pending';

-- Map ready_for_review to PREHIRE_REVIEW
UPDATE users SET status_new = 'PREHIRE_REVIEW' WHERE status = 'ready_for_review';

-- Map active to ACTIVE_EMPLOYEE
UPDATE users SET status_new = 'ACTIVE_EMPLOYEE' WHERE status = 'active';

-- Map completed to ACTIVE_EMPLOYEE
UPDATE users SET status_new = 'ACTIVE_EMPLOYEE' WHERE status = 'completed';

-- Map terminated to TERMINATED_PENDING (if within 7 days) or ARCHIVED
UPDATE users 
SET status_new = CASE 
  WHEN terminated_at IS NOT NULL AND terminated_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 'TERMINATED_PENDING'
  WHEN terminated_at IS NOT NULL AND terminated_at < DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 'ARCHIVED'
  ELSE 'TERMINATED_PENDING'
END
WHERE status = 'terminated';

-- Ensure all admin/superadmin/support users are set to ACTIVE_EMPLOYEE
-- This ensures they can still log in after the migration
UPDATE users 
SET status_new = 'ACTIVE_EMPLOYEE'
WHERE role IN ('super_admin', 'admin', 'support')
  AND status_new != 'ARCHIVED' AND status_new != 'TERMINATED_PENDING';

-- Step 4: Replace old status column with new one
-- Drop old status column
ALTER TABLE users DROP COLUMN status;

-- Rename new column to status
ALTER TABLE users CHANGE COLUMN status_new status ENUM(
  'PENDING_SETUP',
  'PREHIRE_OPEN',
  'PREHIRE_REVIEW',
  'ONBOARDING',
  'ACTIVE_EMPLOYEE',
  'TERMINATED_PENDING',
  'ARCHIVED'
) NOT NULL DEFAULT 'PENDING_SETUP';

-- Recreate index on status
CREATE INDEX idx_user_status ON users(status);
