-- Migration: Payroll stage carryovers meta JSON
-- Description: Persist carryover categories so pay output can show "Old Note", "Code Changed", and "Late Addition".

ALTER TABLE payroll_stage_carryovers
  ADD COLUMN carryover_meta_json JSON NULL AFTER carryover_finalized_row_count;

