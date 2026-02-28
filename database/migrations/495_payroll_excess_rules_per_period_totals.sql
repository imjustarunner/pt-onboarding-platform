-- Migration: Excess compensation rules - per-pay-period expected totals
-- Description: Simplify from per-code caps to per-pay-period expected totals.
-- Table columns: Service Code | Expected Direct Total (mins) | Expected Indirect Total (mins) | Credit
-- Excess = actual direct/indirect minus expected, paid at provider's rates.

ALTER TABLE payroll_excess_compensation_rules
  ADD COLUMN expected_direct_total INT NOT NULL DEFAULT 0 AFTER service_code,
  ADD COLUMN expected_indirect_total INT NOT NULL DEFAULT 0 AFTER expected_direct_total;

UPDATE payroll_excess_compensation_rules
SET expected_direct_total = COALESCE(direct_service_included_max, 0),
    expected_indirect_total = COALESCE(admin_included_max, 0);

ALTER TABLE payroll_excess_compensation_rules
  DROP COLUMN direct_service_minimum,
  DROP COLUMN direct_service_included_max,
  DROP COLUMN admin_included_max;
