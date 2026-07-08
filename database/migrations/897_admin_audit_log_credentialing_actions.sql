-- Migration 897: Add credentialing access grant/revoke action types to admin_audit_log
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
