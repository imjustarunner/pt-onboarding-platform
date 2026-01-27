-- Migration: Add PROSPECTIVE user status
-- Description: Introduce PROSPECTIVE as an internal-only applicant stage before prehire/onboarding.

-- MySQL ENUM changes require rebuilding the column; use a temp column for safety.
ALTER TABLE users
ADD COLUMN status_new ENUM(
  'PROSPECTIVE',
  'PENDING_SETUP',
  'PREHIRE_OPEN',
  'PREHIRE_REVIEW',
  'ONBOARDING',
  'ACTIVE_EMPLOYEE',
  'TERMINATED_PENDING',
  'ARCHIVED'
) NOT NULL DEFAULT 'PENDING_SETUP' AFTER status;

-- Copy existing status values into the new enum.
UPDATE users SET status_new = status;

-- Replace old status column with new one.
ALTER TABLE users DROP COLUMN status;

ALTER TABLE users CHANGE COLUMN status_new status ENUM(
  'PROSPECTIVE',
  'PENDING_SETUP',
  'PREHIRE_OPEN',
  'PREHIRE_REVIEW',
  'ONBOARDING',
  'ACTIVE_EMPLOYEE',
  'TERMINATED_PENDING',
  'ARCHIVED'
) NOT NULL DEFAULT 'PENDING_SETUP';

-- Recreate status index (migration runner ignores already-exists errors).
CREATE INDEX idx_user_status ON users(status);

