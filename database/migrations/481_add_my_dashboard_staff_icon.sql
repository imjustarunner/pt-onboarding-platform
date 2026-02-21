-- Migration: Add staff/team card icon for dashboard (Your Team widget when kudos enabled)
--
-- IMPORTANT:
-- Some deployments hit MySQL's 64-key limit on heavily-indexed tables (ER_TOO_MANY_KEYS).
-- To avoid migration failures, we add columns WITHOUT foreign key constraints.
-- This migration is still safe to re-run: the migration runner skips "Duplicate column" errors.

-- Platform default: column only (no FK)
ALTER TABLE platform_branding
  ADD COLUMN my_dashboard_staff_icon_id INT NULL;

-- Organization override: column only (no FK)
ALTER TABLE agencies
  ADD COLUMN my_dashboard_staff_icon_id INT NULL;
