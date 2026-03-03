-- Migration: Add medical records release access audit action types
-- Description: Track when admins grant or revoke medical records release access (view ROI submissions).

ALTER TABLE admin_audit_log
MODIFY COLUMN action_type ENUM(
  'reset_module',
  'reset_track',
  'mark_module_complete',
  'mark_track_complete',
  'grant_payroll_access',
  'revoke_payroll_access',
  'grant_medical_records_release_access',
  'revoke_medical_records_release_access'
) NOT NULL;
