-- Deduplicate an operator-reviewed correction across payroll periods.
ALTER TABLE payroll_manual_pay_lines
  ADD COLUMN correction_key CHAR(64) NULL,
  ADD UNIQUE KEY uq_payroll_manual_correction (agency_id, correction_key);
