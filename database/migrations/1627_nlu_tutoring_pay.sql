ALTER TABLE payroll_pay_system_rates
  ADD COLUMN tutoring_rate DECIMAL(10,2) NULL,
  ADD COLUMN h2014_rate DECIMAL(10,2) NULL,
  ADD COLUMN supplemental_rates_effective_on DATE NULL;

-- NLU uses the same clinical category/level foundation; preserve any configured NLU rows.
INSERT INTO payroll_pay_system_rates
 (agency_id, category, level, credit_rate, credit_rate_probation, hcode_rate, hcode_rate_probation,
  indirect_rate, support_activity_rate, auto_indirect_minutes_per_hour, tier_bonus_json, tier_bonus_ffs_json, tier_bonus_hcode_json, spanish_bonus_json, location_bonus_json)
SELECT nlu.id, r.category, r.level, r.credit_rate, r.credit_rate_probation, r.hcode_rate, r.hcode_rate_probation,
 r.indirect_rate, r.support_activity_rate, r.auto_indirect_minutes_per_hour, r.tier_bonus_json, r.tier_bonus_ffs_json, r.tier_bonus_hcode_json, r.spanish_bonus_json, r.location_bonus_json
FROM agencies nlu JOIN agencies itsco ON itsco.slug = 'itsco'
JOIN payroll_pay_system_rates r ON r.agency_id = itsco.id
WHERE nlu.slug IN ('nlu','nextlevelup','nextleveluplcc','next-level-up')
ON DUPLICATE KEY UPDATE agency_id = VALUES(agency_id);

UPDATE payroll_pay_system_rates r JOIN agencies a ON a.id = r.agency_id
SET r.tutoring_rate = CASE r.level WHEN 1 THEN 18 WHEN 2 THEN 20.50 WHEN 3 THEN 23 WHEN 4 THEN 25.50 WHEN 5 THEN 28 END,
    r.supplemental_rates_effective_on = CURRENT_DATE,
    r.h2014_rate = CASE WHEN r.category = 1 THEN 22 ELSE NULL END
WHERE a.slug IN ('nlu','nextlevelup','nextleveluplcc','next-level-up') AND r.level BETWEEN 1 AND 5;

-- NLU's internal tutoring code uses 15-minute compensation units, not an insurance billing code.
INSERT INTO payroll_service_code_rules
 (agency_id, service_code, category, other_slot, unit_to_hour_multiplier, duration_minutes, counts_for_tier,
  tier_credit_multiplier, pay_divisor, pay_rate_unit, credit_value, show_in_rate_sheet, pay_method)
SELECT a.id, codes.code, 'direct', 1, 0.25, 15, 1, 1, 4, 'per_unit', 0.25, 1, 'fixed_rate'
FROM agencies a CROSS JOIN (SELECT 'TUTORING 15 MIN' AS code) codes
WHERE a.slug IN ('nlu','nextlevelup','nextleveluplcc','next-level-up')
ON DUPLICATE KEY UPDATE category='direct', unit_to_hour_multiplier=0.25, duration_minutes=15,
 counts_for_tier=1, tier_credit_multiplier=1, pay_divisor=4, pay_rate_unit='per_unit', credit_value=0.25, show_in_rate_sheet=1, pay_method='fixed_rate', pay_percent=NULL;

-- Ensure H2014 is offered even when NLU has not configured a code rule yet.
INSERT IGNORE INTO payroll_service_code_rules
 (agency_id, service_code, category, unit_to_hour_multiplier, duration_minutes, counts_for_tier, tier_credit_multiplier, pay_divisor, pay_rate_unit, credit_value, show_in_rate_sheet, pay_method)
SELECT id, 'H2014', 'direct', 0.25, 15, 1, 1, 4, 'per_unit', 0.25, 1, 'fixed_rate'
FROM agencies WHERE slug IN ('nlu','nextlevelup','nextleveluplcc','next-level-up');
