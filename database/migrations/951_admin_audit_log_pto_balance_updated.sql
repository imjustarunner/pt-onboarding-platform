-- Migration 951: Add pto_balance_updated audit action type
-- Description: Track admin/payroll PTO balance edits (individual profile + bulk PTO sheet)
-- with before/after hours in Audit Center. Ledger rows remain the domain hour trail.
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
  'pto_balance_updated'
) NOT NULL;
