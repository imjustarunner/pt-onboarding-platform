-- Migration: Extend reimbursement + company card expenses with metadata and category splits
-- Adds: payment method, project/client reference, supervisor/approver, reason/purpose, and category split allocations.

-- Reimbursements
ALTER TABLE payroll_reimbursement_claims
  ADD COLUMN payment_method VARCHAR(32) NULL AFTER amount,
  ADD COLUMN project_ref VARCHAR(64) NULL AFTER purchase_preapproved,
  ADD COLUMN reason VARCHAR(255) NULL AFTER project_ref,
  ADD COLUMN splits_json TEXT NULL AFTER reason;

-- Company card expenses
ALTER TABLE payroll_company_card_expenses
  ADD COLUMN payment_method VARCHAR(32) NOT NULL DEFAULT 'company_card' AFTER amount,
  ADD COLUMN supervisor_name VARCHAR(255) NULL AFTER vendor,
  ADD COLUMN project_ref VARCHAR(64) NULL AFTER supervisor_name,
  ADD COLUMN category VARCHAR(64) NULL AFTER project_ref,
  ADD COLUMN splits_json TEXT NULL AFTER category;

