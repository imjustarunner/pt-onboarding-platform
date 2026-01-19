-- Migration: Add provider and school_staff roles (keep clinician for legacy)
-- Description:
-- - Adds 'provider' as the preferred role (UI label for former 'clinician')
-- - Adds 'school_staff' for limited-access school users
-- - Keeps 'clinician' for backward compatibility with existing rows
--
-- Safe: MODIFY COLUMN on ENUM is idempotent when already applied.

ALTER TABLE users
  MODIFY COLUMN role ENUM(
    'super_admin',
    'admin',
    'support',
    'supervisor',
    'clinical_practice_assistant',
    'staff',
    'provider',
    'school_staff',
    'clinician',
    'facilitator',
    'intern'
  ) DEFAULT 'provider';

