-- Separate school leave from sick/training; never export it as an ADP leave bank.
ALTER TABLE payroll_pto_accounts
 ADD COLUMN school_support_balance_hours DECIMAL(12,6) NOT NULL DEFAULT 0;
ALTER TABLE payroll_pto_accounts ADD COLUMN training_adp_through_date DATE NULL;
ALTER TABLE payroll_pto_accounts ADD COLUMN training_adp_confirmed_at DATETIME NULL;
ALTER TABLE payroll_pto_requests
 MODIFY request_type ENUM('sick','training','school_support') NOT NULL;
ALTER TABLE payroll_pto_requests ADD COLUMN training_cost DECIMAL(12,2) NULL;
ALTER TABLE payroll_pto_requests ADD COLUMN approved_rates_json JSON NULL;
ALTER TABLE payroll_pto_ledger MODIFY pto_bucket ENUM('sick','training','school_support') NOT NULL;
CREATE TABLE IF NOT EXISTS payroll_leave_basis_postings (
 agency_id INT NOT NULL, user_id INT NOT NULL, payroll_period_id INT NOT NULL,
 pto_bucket ENUM('training','school_support') NOT NULL,
 basis_hours DECIMAL(14,6) NOT NULL, earned_hours DECIMAL(14,6) NOT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(agency_id,user_id,payroll_period_id,pto_bucket)
);
ALTER TABLE payroll_pto_accounts MODIFY training_balance_hours DECIMAL(12,6) NOT NULL DEFAULT 0;
ALTER TABLE payroll_pto_ledger MODIFY hours_delta DECIMAL(12,6) NOT NULL;
-- Preserve blended PTO rates precisely when a period includes multiple effective rates.
ALTER TABLE payroll_adjustments MODIFY pto_rate DECIMAL(14,6) NOT NULL DEFAULT 0;
