-- Migration: Add payroll access audit action types
-- Description: Allow admin_audit_log to track payroll access grants/revokes

ALTER TABLE admin_audit_log
MODIFY COLUMN action_type ENUM(
  'reset_module',
  'reset_track',
  'mark_module_complete',
  'mark_track_complete',
  'grant_payroll_access',
  'revoke_payroll_access'
) NOT NULL;
