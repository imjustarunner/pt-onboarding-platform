-- Preserve all existing comparison types and append the name-only review type.
-- Appending preserves the enum positions of previously stored audit values.
ALTER TABLE payroll_run_deltas
  MODIFY COLUMN delta_type ENUM(
    'status_change',
    'code_change',
    'unit_change',
    'added',
    'removed',
    'overpaid_deleted',
    'location_changed',
    'service_code_changed',
    'identity_changed'
  ) NOT NULL;
