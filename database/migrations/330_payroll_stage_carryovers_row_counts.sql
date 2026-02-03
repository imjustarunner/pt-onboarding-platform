-- Migration: Payroll stage carryovers row counts
-- Description: Track how many distinct note rows contributed to carryover units (1 row = 1 note), so UI can show note counts vs units.

ALTER TABLE payroll_stage_carryovers
  ADD COLUMN carryover_finalized_row_count INT NOT NULL DEFAULT 0 AFTER carryover_finalized_units;

