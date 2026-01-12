-- Migration: Update admin and superadmin users to ACTIVE_EMPLOYEE status
-- Description: Ensure admin users can still log in after status lifecycle refactor

-- Update super_admin and admin users to ACTIVE_EMPLOYEE status
-- This ensures they can still access the system after the status refactor
UPDATE users 
SET status = 'ACTIVE_EMPLOYEE'
WHERE role IN ('super_admin', 'admin', 'support')
  AND status NOT IN ('ARCHIVED', 'TERMINATED_PENDING');

-- Also update any users with 'active' or 'completed' status to ACTIVE_EMPLOYEE
-- (in case migration 095 didn't catch all cases)
UPDATE users 
SET status = 'ACTIVE_EMPLOYEE'
WHERE status IN ('active', 'completed')
  AND role IN ('super_admin', 'admin', 'support');
