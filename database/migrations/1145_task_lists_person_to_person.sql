-- Migration 1145: make task_lists person-to-person (agency_id optional)
-- Tasks and shared lists are now tied to people first; agency context is optional.
-- This allows superadmins and cross-agency admins to share lists without a tenant requirement.

ALTER TABLE task_lists
  MODIFY COLUMN agency_id INT NULL DEFAULT NULL
    COMMENT 'Optional tenant scope; NULL means list is person-scoped (shared via membership only)';
