-- Migration 1290: Clean Gear tenant list — archive noise, one Summit Stats Team Challenge

-- Demo ITSCO was renamed/archived in 1152; ensure archived demos stay out of lists
UPDATE agencies
SET
  is_archived = 1,
  is_active = 0,
  updated_at = CURRENT_TIMESTAMP
WHERE LOWER(COALESCE(organization_type, 'agency')) = 'agency'
  AND COALESCE(is_archived, 0) = 0
  AND (
    LOWER(TRIM(name)) LIKE 'demo itsco%'
    OR LOWER(TRIM(name)) LIKE '%(archived)%'
  );

-- Canonical Summit product tenant display name (prefer sstc, also fix live ssc if still used)
UPDATE agencies
SET
  name = 'Summit Stats Team Challenge',
  official_name = COALESCE(NULLIF(TRIM(official_name), ''), 'Summit Stats Team Challenge'),
  updated_at = CURRENT_TIMESTAMP
WHERE LOWER(COALESCE(organization_type, 'agency')) = 'agency'
  AND COALESCE(is_archived, 0) = 0
  AND LOWER(COALESCE(slug, portal_url, '')) IN ('sstc', 'ssc');

-- If both sstc and ssc are active, keep sstc and archive ssc (matches migration 905 intent)
UPDATE agencies
SET
  is_archived = 1,
  is_active = 0,
  updated_at = CURRENT_TIMESTAMP
WHERE LOWER(COALESCE(slug, portal_url, '')) = 'ssc'
  AND COALESCE(is_archived, 0) = 0
  AND EXISTS (
    SELECT 1 FROM (
      SELECT id FROM agencies
      WHERE LOWER(COALESCE(slug, portal_url, '')) = 'sstc'
        AND COALESCE(is_archived, 0) = 0
      LIMIT 1
    ) live_sstc
  );

-- Soft-archive leftover plain "Summit Stats" rows that are not the canonical slug
UPDATE agencies
SET
  is_archived = 1,
  is_active = 0,
  updated_at = CURRENT_TIMESTAMP
WHERE LOWER(COALESCE(organization_type, 'agency')) = 'agency'
  AND COALESCE(is_archived, 0) = 0
  AND LOWER(TRIM(name)) = 'summit stats'
  AND LOWER(COALESCE(slug, portal_url, '')) NOT IN ('sstc', 'ssc');

-- "Counseling and Therapy" is a generic label, not a real Gear tenant
UPDATE agencies
SET
  is_archived = 1,
  is_active = 0,
  updated_at = CURRENT_TIMESTAMP
WHERE LOWER(TRIM(name)) = 'counseling and therapy'
  AND LOWER(COALESCE(organization_type, 'agency')) = 'agency'
  AND COALESCE(is_archived, 0) = 0;
