-- Migration 1365: Normalize school district display names to short codes (D11, D12, DPS)
-- and ensure public finder / future school creates use those codes.

UPDATE school_profiles
SET district_name = 'D11'
WHERE LOWER(TRIM(COALESCE(district_name, ''))) IN (
  'd11',
  'district 11',
  'colorado springs school district 11',
  'csd 11',
  'csd11',
  'coloradosprings d11',
  'colorado springs d11'
);

UPDATE school_profiles
SET district_name = 'D12'
WHERE LOWER(TRIM(COALESCE(district_name, ''))) IN (
  'd12',
  'district 12',
  'colorado springs school district 12'
);

UPDATE school_profiles
SET district_name = 'DPS'
WHERE LOWER(TRIM(COALESCE(district_name, ''))) IN (
  'dps',
  'denver',
  'denver public schools',
  'denver public school'
);

-- agency_districts catalog (when present)
UPDATE agency_districts
SET name = 'D11',
    slug = 'd11'
WHERE LOWER(TRIM(COALESCE(slug, ''))) IN (
  'd11',
  'district-11',
  'colorado-springs-school-district-11',
  'csd-11'
)
OR LOWER(TRIM(COALESCE(name, ''))) IN (
  'd11',
  'district 11',
  'colorado springs school district 11'
);

UPDATE agency_districts
SET name = 'D12',
    slug = 'd12'
WHERE LOWER(TRIM(COALESCE(slug, ''))) IN ('d12', 'district-12')
OR LOWER(TRIM(COALESCE(name, ''))) IN ('d12', 'district 12');

UPDATE agency_districts
SET name = 'DPS',
    slug = 'dps'
WHERE LOWER(TRIM(COALESCE(slug, ''))) IN ('dps', 'denver', 'denver-public-schools')
OR LOWER(TRIM(COALESCE(name, ''))) IN ('dps', 'denver', 'denver public schools');
