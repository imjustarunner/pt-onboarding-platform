-- Stable client submission keys prevent duplicate school-support deductions on retries.
ALTER TABLE payroll_pto_requests
 ADD COLUMN submission_key VARCHAR(64) NULL,
 ADD UNIQUE KEY uq_pto_submission_key (agency_id,user_id,submission_key);
