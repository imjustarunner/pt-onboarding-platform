-- Migration 952: Add supervision_balance_updated audit action type
-- Description: Track admin/payroll supervision hour edits from the Supervision sheet
-- (individual + group) with before/after values in Audit Center.
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
  'revoke_credentialing_access',
  'pto_balance_updated',
  'supervision_balance_updated'
) NOT NULL;
