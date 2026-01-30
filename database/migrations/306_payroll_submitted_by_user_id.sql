-- Migration: Add submitted_by_user_id to payroll submissions
-- Description:
-- Track who actually submitted a claim/request (provider self-submission vs. admin submit-on-behalf).
-- Backfill legacy rows as self-submitted (submitted_by_user_id = user_id).

ALTER TABLE payroll_mileage_claims
  ADD COLUMN submitted_by_user_id INT NULL AFTER user_id;

ALTER TABLE payroll_medcancel_claims
  ADD COLUMN submitted_by_user_id INT NULL AFTER user_id;

ALTER TABLE payroll_reimbursement_claims
  ADD COLUMN submitted_by_user_id INT NULL AFTER user_id;

ALTER TABLE payroll_time_claims
  ADD COLUMN submitted_by_user_id INT NULL AFTER user_id;

ALTER TABLE payroll_company_card_expenses
  ADD COLUMN submitted_by_user_id INT NULL AFTER user_id;

ALTER TABLE payroll_pto_requests
  ADD COLUMN submitted_by_user_id INT NULL AFTER user_id;

-- Backfill: legacy data assumed self-submitted.
UPDATE payroll_mileage_claims SET submitted_by_user_id = user_id WHERE submitted_by_user_id IS NULL;
UPDATE payroll_medcancel_claims SET submitted_by_user_id = user_id WHERE submitted_by_user_id IS NULL;
UPDATE payroll_reimbursement_claims SET submitted_by_user_id = user_id WHERE submitted_by_user_id IS NULL;
UPDATE payroll_time_claims SET submitted_by_user_id = user_id WHERE submitted_by_user_id IS NULL;
UPDATE payroll_company_card_expenses SET submitted_by_user_id = user_id WHERE submitted_by_user_id IS NULL;
UPDATE payroll_pto_requests SET submitted_by_user_id = user_id WHERE submitted_by_user_id IS NULL;

-- Indexes (for reporting/auditing)
CREATE INDEX idx_payroll_mileage_claims_submitted_by_user_id ON payroll_mileage_claims(submitted_by_user_id);
CREATE INDEX idx_payroll_medcancel_claims_submitted_by_user_id ON payroll_medcancel_claims(submitted_by_user_id);
CREATE INDEX idx_payroll_reimbursement_claims_submitted_by_user_id ON payroll_reimbursement_claims(submitted_by_user_id);
CREATE INDEX idx_payroll_time_claims_submitted_by_user_id ON payroll_time_claims(submitted_by_user_id);
CREATE INDEX idx_payroll_company_card_expenses_submitted_by_user_id ON payroll_company_card_expenses(submitted_by_user_id);
CREATE INDEX idx_payroll_pto_requests_submitted_by_user_id ON payroll_pto_requests(submitted_by_user_id);

