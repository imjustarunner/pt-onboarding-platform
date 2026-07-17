-- Migration 968: remember original clock-out so hourly workers can correct earlier
ALTER TABLE payroll_indirect_time_sessions
  ADD COLUMN clocked_out_at_original DATETIME NULL DEFAULT NULL
  COMMENT 'First recorded clock-out; adjustments may only move clocked_out_at earlier than this';

UPDATE payroll_indirect_time_sessions
SET clocked_out_at_original = clocked_out_at
WHERE status = 'closed'
  AND clocked_out_at IS NOT NULL
  AND clocked_out_at_original IS NULL;
