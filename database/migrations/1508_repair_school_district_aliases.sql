-- Onboarding outreach sync and bulk imports could restore full district names
-- after migration 1365. All profile writers now canonicalize known aliases.
-- Repair those labels without changing school identity, affiliations, or district IDs.
-- Only established aliases are folded; genuinely different districts are preserved.
UPDATE school_profiles
SET district_name = CASE
  WHEN LOWER(TRIM(district_name)) IN (
    'dps', 'denver', 'denver public schools', 'denver public school'
  ) THEN 'DPS'
  WHEN LOWER(TRIM(district_name)) IN (
    'd11', 'district 11', 'colorado springs school district 11',
    'csd 11', 'csd11', 'coloradosprings d11', 'colorado springs d11'
  ) THEN 'D11'
  WHEN LOWER(TRIM(district_name)) IN (
    'd12', 'district 12', 'colorado springs school district 12'
  ) THEN 'D12'
  ELSE district_name
END
WHERE LOWER(TRIM(district_name)) IN (
  'dps', 'denver', 'denver public schools', 'denver public school',
  'd11', 'district 11', 'colorado springs school district 11',
  'csd 11', 'csd11', 'coloradosprings d11', 'colorado springs d11',
  'd12', 'district 12', 'colorado springs school district 12'
);
