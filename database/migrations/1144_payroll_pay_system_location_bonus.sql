-- Migration 1144: Add location bonus to pay system rates and per-user eligibility flag
-- Location bonus (e.g. Denver office) is a flat $/credit bonus for staff assigned to specific offices.
-- Separate from the tier performance bonus (which is earned by hitting session volume thresholds).

ALTER TABLE payroll_pay_system_rates
  ADD COLUMN location_bonus_json JSON NULL
    COMMENT 'e.g. {"1":0,"2":0,"3":0} dollars per credit/hour-equivalent for location-eligible staff'
    AFTER spanish_bonus_json;

ALTER TABLE payroll_user_compensation_levels
  ADD COLUMN location_bonus_eligible TINYINT(1) NOT NULL DEFAULT 0
    COMMENT '1=eligible for location bonus (e.g. Denver office assignment)'
    AFTER spanish_bonus_eligible;
