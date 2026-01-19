-- Migration: Add client_guardian role
-- Description:
-- - Adds 'client_guardian' for guardian portal accounts (non-clinical)
-- - Keeps existing roles and defaults
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
    'client_guardian',
    'clinician',
    'facilitator',
    'intern'
  ) DEFAULT 'provider';

