-- Payroll raw-audit actions:
-- 1) Persist richer raw-audit delta types.
-- 2) Allow manual pay lines to store structured detail metadata.

ALTER TABLE payroll_run_deltas
  MODIFY COLUMN delta_type ENUM(
    'status_change',
    'code_change',
    'unit_change',
    'added',
    'removed',
    'overpaid_deleted',
    'location_changed',
    'service_code_changed'
  ) NOT NULL;

ALTER TABLE payroll_manual_pay_lines
  ADD COLUMN metadata_json JSON NULL AFTER credits_hours;
