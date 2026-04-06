-- Add work_role to preserve a club_manager user's work-context role.
-- When users.role = 'club_manager', work_role stores what they should be treated as
-- in a non-affiliation (work) agency context (e.g. 'provider', 'supervisor').
-- NULL means "not a club_manager user" — no change in behavior for anyone else.

ALTER TABLE users
  ADD COLUMN work_role ENUM(
    'admin',
    'assistant_admin',
    'supervisor',
    'facilitator',
    'intern',
    'support',
    'staff',
    'provider',
    'school_staff',
    'client_guardian',
    'clinical_practice_assistant',
    'provider_plus'
  ) NULL DEFAULT NULL;

-- Backfill existing club_manager users.
-- Migration 657 promoted them from their original role; 'provider' is the safest default.
-- Admins can correct individual users via the UI after deployment.
UPDATE users
  SET work_role = 'provider'
  WHERE role = 'club_manager'
    AND work_role IS NULL;
