-- 570_fix_payroll_imports_slot_backfill.sql
-- Only run if 569 backfill failed or slot_number has wrong values
UPDATE payroll_imports pi
JOIN (
  SELECT id, LEAST(rn, 3) AS slot_number FROM (
    SELECT id,
      (SELECT COUNT(*) FROM payroll_imports pi2
       WHERE pi2.payroll_period_id = pi.payroll_period_id
         AND (pi2.created_at < pi.created_at OR (pi2.created_at = pi.created_at AND pi2.id <= pi.id))) AS rn
    FROM payroll_imports pi
  ) x
) ranked ON pi.id = ranked.id
SET pi.slot_number = ranked.slot_number;