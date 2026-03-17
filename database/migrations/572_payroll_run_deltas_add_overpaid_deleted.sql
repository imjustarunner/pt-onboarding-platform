-- Migration: add overpaid_deleted to payroll_run_deltas.delta_type enum
-- When a paid session (DRAFT_PAID/FINALIZED) is gone with no matching added row,
-- we flag it as overpaid_deleted (session deleted after payment = overpaid).

ALTER TABLE payroll_run_deltas
  MODIFY COLUMN delta_type ENUM('status_change','code_change','unit_change','added','removed','overpaid_deleted') NOT NULL;
