-- Migration 1400: claim duration rules for H0004 day cap + H2015→H2016 overflow
-- Align agency_medical_service_codes with Colorado / ITSCO billing practice.
-- Does not change payroll compensation dictionary.

UPDATE agency_medical_service_codes
SET
  max_units_per_session = COALESCE(max_units_per_session, 4),
  max_units_per_day = COALESCE(max_units_per_day, 4)
WHERE UPPER(service_code) = 'H0004';

UPDATE agency_medical_service_codes
SET
  max_minutes = COALESCE(max_minutes, 247),
  max_units_per_session = COALESCE(max_units_per_session, 16),
  overflow_service_code = COALESCE(overflow_service_code, 'H2016'),
  overflow_at_minutes = COALESCE(overflow_at_minutes, 248)
WHERE UPPER(service_code) = 'H2015';

UPDATE agency_medical_service_codes
SET
  unit_calc_mode = 'SINGLE',
  unit_minutes = NULL,
  min_minutes = GREATEST(COALESCE(min_minutes, 0), 248),
  max_units_per_session = 1,
  max_units_per_day = COALESCE(max_units_per_day, 1),
  overflow_service_code = NULL,
  overflow_at_minutes = NULL
WHERE UPPER(service_code) = 'H2016';

UPDATE agency_medical_service_codes
SET max_minutes = COALESCE(max_minutes, 74)
WHERE UPPER(service_code) = '90837';
