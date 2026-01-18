-- Migration: Reimbursement claims - require notes and add pre-approval fields
-- Description: Enforce notes (non-null) and store who pre-approved the purchase.

UPDATE payroll_reimbursement_claims
SET notes = ''
WHERE notes IS NULL;

ALTER TABLE payroll_reimbursement_claims
  MODIFY COLUMN notes TEXT NOT NULL,
  ADD COLUMN purchase_approved_by VARCHAR(255) NULL AFTER vendor,
  ADD COLUMN purchase_preapproved TINYINT(1) NULL AFTER purchase_approved_by;

