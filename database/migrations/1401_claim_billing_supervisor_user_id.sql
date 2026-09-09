-- Migration 1401: preferred claim billing supervisor when mode is billing_supervisor
-- Supervisees may have multiple clinical supervisors; any may be chosen for Claim.MD billing NPI.
ALTER TABLE user_agencies
  ADD COLUMN claim_billing_supervisor_user_id INT NULL DEFAULT NULL
  COMMENT 'Preferred supervisor user id for claim billing NPI when claim_billing_mode=billing_supervisor';
