-- Migration: Shred raw billing report fields from payroll_import_rows
-- Description: Remove any previously persisted raw report payload/fields (privacy posture).

UPDATE payroll_import_rows
SET
  raw_row = NULL,
  appt_type = NULL,
  amount_collected = NULL,
  paid_status = NULL
WHERE raw_row IS NOT NULL
   OR appt_type IS NOT NULL
   OR amount_collected IS NOT NULL
   OR paid_status IS NOT NULL;

