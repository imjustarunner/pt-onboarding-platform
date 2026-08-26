-- Migration 1308: Add Note Aid client intake note audit action types
-- These action_type values are used by clientIntakeNote.controller.js and listed in
-- the audit registry, but were never added to admin_audit_log.action_type ENUM.
-- Finalize was failing with "Invalid enum value / Run the latest DB migrations"
-- after the draft had already been marked final.
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
  'supervision_balance_updated',
  'client_intake_note_generated',
  'client_intake_note_diagnosis_remain',
  'client_intake_note_diagnosis_confirmed',
  'client_intake_note_diagnosis_updated',
  'client_intake_note_finalized'
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL;
