-- Add per-eligibility duration override support so min duration can vary by credential tier.

ALTER TABLE credential_service_code_eligibility
  ADD COLUMN min_duration_minutes_override INT NULL AFTER allowed;

-- Seed explicit psychotherapy minimums by credential tier where those pairings are allowed.
UPDATE credential_service_code_eligibility
SET min_duration_minutes_override = 16
WHERE service_code = '90832'
  AND allowed = TRUE
  AND (min_duration_minutes_override IS NULL OR min_duration_minutes_override < 16);

UPDATE credential_service_code_eligibility
SET min_duration_minutes_override = 38
WHERE service_code = '90834'
  AND allowed = TRUE
  AND (min_duration_minutes_override IS NULL OR min_duration_minutes_override < 38);

UPDATE credential_service_code_eligibility
SET min_duration_minutes_override = 53
WHERE service_code = '90837'
  AND allowed = TRUE
  AND (min_duration_minutes_override IS NULL OR min_duration_minutes_override < 53);
