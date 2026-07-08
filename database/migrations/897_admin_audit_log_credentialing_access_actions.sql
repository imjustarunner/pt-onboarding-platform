-- Migration 897: Add credentialing access audit action types
-- Description: The user profile Credentialing Access toggle writes
-- 'grant_credentialing_access' / 'revoke_credentialing_access' rows to
-- admin_audit_log, but those values were never added to the action_type ENUM.
-- Inserting them fails and surfaces as a 500 when saving permissions.
ALTER TABLE admin_audit_log
MODIFY COLUMN action_type ENUM(
  'reset_module',
  'reset_track',
  'mark_module_complete',
  'mark_track_complete',
  'grant_payroll_access',
  'revoke_payroll_access',
  'grant_medical_records_release_access',
  'revoke_medical_records_release_access',
  'grant_credentialing_access',
  'revoke_credentialing_access'
) NOT NULL;
