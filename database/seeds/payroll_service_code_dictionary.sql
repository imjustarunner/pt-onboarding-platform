-- Payroll "Calculator Dictionary" seed
-- This file populates payroll_service_code_rules for a single agency.
--
-- Usage:
--   1) Set your agency id below
--   2) Run this file in MySQL
--
-- Notes:
-- - category drives rate selection + bucket:
--     direct     -> Rate 1 (direct)
--     indirect   -> Rate 2 (indirect)
--     admin      -> Rate 2 (indirect)
--     meeting    -> Rate 2 (indirect)
--     other      -> Other slot hourly (other_rate_1/2/3)
--     tutoring   -> Other slot hourly (defaults to slot 1)
--     mileage    -> flat/non-hourly (unit->hours factor typically 0)
--     bonus      -> flat/non-hourly (unit->hours factor typically 0)
--     reimbursement -> flat/non-hourly (unit->hours factor typically 0)
--     other_pay  -> flat/non-hourly (unit->hours factor typically 0)
--
-- - pay_divisor:
--     if pay_divisor != 1: payroll_hours = units / pay_divisor
--     else: payroll_hours = units * (duration_minutes / 60)
-- - credit_value:
--     tier_credits += units * credit_value
--
-- IMPORTANT: This seed does not delete existing rows; it upserts.

SET @AGENCY_ID := 2;

INSERT INTO payroll_service_code_rules
  (agency_id, service_code, category, other_slot, duration_minutes, counts_for_tier, pay_divisor, credit_value, show_in_rate_sheet)
VALUES
  (@AGENCY_ID, '90785', 'direct', 1, 0, 0, 1, 0, 1),
  (@AGENCY_ID, '90791', 'direct', 1, 60, 1, 1, 1, 1),
  (@AGENCY_ID, '90832', 'direct', 1, 30, 1, 2, 0.5, 1),
  (@AGENCY_ID, '90834', 'direct', 1, 45, 1, 1, 0.75, 1),
  (@AGENCY_ID, '90837', 'direct', 1, 60, 1, 1, 1, 1),
  (@AGENCY_ID, '90839', 'direct', 1, 60, 1, 1, 1, 1),
  (@AGENCY_ID, '90840', 'direct', 1, 30, 1, 1, 0.5, 1),
  (@AGENCY_ID, '90846', 'direct', 1, 60, 1, 1, 1, 1),
  (@AGENCY_ID, '90847', 'direct', 1, 60, 1, 1, 1, 1),
  (@AGENCY_ID, '90853', 'direct', 1, 60, 1, 1, 1, 1),
  (@AGENCY_ID, '97535', 'direct', 1, 15, 1, 4, 0.25, 1),
  (@AGENCY_ID, '99051', 'direct', 1, 0, 0, 1, 0, 1),

  (@AGENCY_ID, '99414', 'indirect', 1, 1, 1, 60, 0.01666666667, 1),
  (@AGENCY_ID, '99415', 'indirect', 1, 1, 1, 60, 0.01666666667, 1),
  (@AGENCY_ID, '99416', 'indirect', 1, 1, 1, 60, 0.01666666667, 1),
  (@AGENCY_ID, 'H0002', 'indirect', 1, 0, 0, 1, 0, 1),
  (@AGENCY_ID, 'H0004', 'direct', 1, 15, 1, 4, 0.25, 1),
  (@AGENCY_ID, 'H0023', 'direct', 1, 15, 1, 4, 0.25, 1),
  (@AGENCY_ID, 'H0025', 'direct', 1, 15, 1, 4, 0.25, 1),
  (@AGENCY_ID, 'H0031', 'direct', 1, 1, 1, 60, 0.01666666667, 1),
  (@AGENCY_ID, 'H0032', 'direct', 1, 1, 1, 60, 0.01666666667, 1),
  (@AGENCY_ID, 'H2014', 'direct', 1, 15, 1, 4, 0.25, 1),
  (@AGENCY_ID, 'H2015', 'direct', 1, 15, 1, 4, 0.25, 1),
  (@AGENCY_ID, 'H2016', 'direct', 1, 1, 1, 60, 0.01666666667, 1),
  (@AGENCY_ID, 'H2017', 'direct', 1, 15, 1, 4, 0.25, 1),
  (@AGENCY_ID, 'H2018', 'direct', 1, 1, 1, 60, 0.01666666667, 1),
  (@AGENCY_ID, 'H2021', 'direct', 1, 15, 1, 4, 0.25, 1),
  (@AGENCY_ID, 'H2022', 'direct', 1, 1, 1, 60, 0.01666666667, 1),
  (@AGENCY_ID, 'H2033', 'direct', 1, 15, 1, 4, 0.25, 1),
  (@AGENCY_ID, 'S9454', 'direct', 1, 1, 1, 60, 0.01666666667, 1),
  (@AGENCY_ID, 'T1017', 'direct', 1, 15, 1, 4, 0.25, 1),

  (@AGENCY_ID, 'Admin Time', 'admin', 1, 1, 1, 60, 0.01666666667, 1),
  (@AGENCY_ID, 'IMatter', 'direct', 1, 0, 0, 1, 0, 1),
  (@AGENCY_ID, 'Indirect Time', 'indirect', 1, 1, 1, 60, 0.01666666667, 1),
  (@AGENCY_ID, 'Individual Meeting', 'meeting', 1, 1, 1, 60, 0.01666666667, 1),
  (@AGENCY_ID, 'Mentor/CPA Meeting', 'meeting', 1, 1, 1, 60, 0.01666666667, 1),
  (@AGENCY_ID, 'MedCancel', 'other_pay', 1, 0, 0, 1, 0, 0),
  (@AGENCY_ID, 'Missed Appt', 'other_pay', 1, 0, 0, 1, 0, 0),
  (@AGENCY_ID, 'Outreach', 'indirect', 1, 60, 1, 1, 1, 1),
  (@AGENCY_ID, 'SALARY', 'direct', 1, 0, 0, 1, 0, 0),
  (@AGENCY_ID, 'Mileage', 'mileage', 1, 0, 0, 1, 0, 0),
  (@AGENCY_ID, 'BONUS', 'bonus', 1, 0, 0, 1, 0, 0),
  (@AGENCY_ID, 'Commission', 'other_pay', 1, 0, 0, 1, 0, 0),
  (@AGENCY_ID, 'MEETING', 'meeting', 1, 1, 1, 60, 0.01666666667, 0),
  (@AGENCY_ID, 'Pro-Bono Service', 'direct', 1, 60, 1, 1, 1, 1),
  (@AGENCY_ID, 'Reimbursement', 'reimbursement', 1, 0, 0, 1, 0, 0),
  (@AGENCY_ID, 'Indirect Hours', 'indirect', 1, 1, 1, 60, 0.01666666667, 0),
  (@AGENCY_ID, 'Tutoring', 'tutoring', 1, 60, 1, 1, 1, 1),
  (@AGENCY_ID, 'Homework', 'indirect', 1, 45, 1, 1, 1, 1),
  (@AGENCY_ID, 'Holiday Bonus', 'bonus', 1, 0, 0, 1, 0, 0)
ON DUPLICATE KEY UPDATE
  category = VALUES(category),
  other_slot = VALUES(other_slot),
  duration_minutes = VALUES(duration_minutes),
  counts_for_tier = VALUES(counts_for_tier),
  pay_divisor = VALUES(pay_divisor),
  credit_value = VALUES(credit_value),
  show_in_rate_sheet = VALUES(show_in_rate_sheet),
  updated_at = CURRENT_TIMESTAMP;

