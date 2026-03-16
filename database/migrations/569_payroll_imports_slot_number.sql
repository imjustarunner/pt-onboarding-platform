-- Add explicit slot_number (Run 1, 2, 3) to payroll_imports.
-- Runs are tagged as Run 1, Run 2, Run 3 of the pay period instead of order-only.
ALTER TABLE payroll_imports
  ADD COLUMN slot_number TINYINT UNSIGNED NOT NULL DEFAULT 1
  AFTER payroll_period_id;

-- Backfill: assign slot 1, 2, 3 by created_at order per period.
-- Use temp table to avoid "can't specify target table for update" error.
CREATE TEMPORARY TABLE _payroll_import_slot_backfill (
  id INT PRIMARY KEY,
  slot_number TINYINT UNSIGNED NOT NULL
);
INSERT INTO _payroll_import_slot_backfill (id, slot_number)
SELECT id, LEAST(rn, 3) FROM (
  SELECT id,
    (SELECT COUNT(*) FROM payroll_imports pi2
     WHERE pi2.payroll_period_id = pi.payroll_period_id
       AND (pi2.created_at < pi.created_at OR (pi2.created_at = pi.created_at AND pi2.id <= pi.id))) AS rn
  FROM payroll_imports pi
) x;
UPDATE payroll_imports pi
JOIN _payroll_import_slot_backfill b ON pi.id = b.id
SET pi.slot_number = b.slot_number;
DROP TEMPORARY TABLE _payroll_import_slot_backfill;

CREATE INDEX idx_import_period_slot ON payroll_imports (payroll_period_id, slot_number);
