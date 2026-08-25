-- Migration 1290: Clean Gear tenant list — archive noise, one Summit Stats Team Challenge

-- Demo ITSCO was renamed/archived in 1152; ensure it stays out of active tenant lists
UPDATE agencies
SET
  is_archived = 1,
  is_active = 0,
  updated_at = CURRENT_TIMESTAMP
WHERE (
    LOWER(TRIM(name)) LIKE 'demo itsco%'
    OR LOWER(TRIM(name)) LIKE '%(archived)%'
  )
  AND LOWER(COALESCE(organization_type, 'agency')) = 'agency'
  AND COALESCE(is_archived, 0) = 0;

-- Canonical Summit Stats product tenant: sstc (preferred) or ssc
UPDATE agencies
SET
  name = 'Summit Stats Team Challenge',
  official_name = COALESCE(NULLIF(TRIM(official_name), ''), 'Summit Stats Team Challenge'),
  updated_at = CURRENT_TIMESTAMP
WHERE LOWER(COALESCE(slug, portal_url, '')) IN ('sstc', 'ssc')
  AND LOWER(COALESCE(organization_type, 'agency')) = 'agency'
  AND COALESCE(is_archived, 0) = 0;

-- Soft-archive leftover Summit Stats duplicates (keep one canonical row)
UPDATE agencies
SET
  is_archived = 1,
  is_active = 0,
  updated_at = CURRENT_TIMESTAMP
WHERE LOWER(COALESCE(organization_type, 'agency')) = 'agency'
  AND COALESCE(is_archived, 0) = 0
  AND (
    LOWER(TRIM(name)) = 'summit stats'
    OR LOWER(TRIM(name)) = 'summit stats team challenge'
  )
  AND LOWER(COALESCE(slug, portal_url, '')) NOT IN ('sstc', 'ssc')
  AND id NOT IN (
    SELECT keep_id FROM (
      SELECT COALESCE(
        (SELECT id FROM agencies WHERE LOWER(COALESCE(slug, portal_url, '')) = 'sstc' AND COALESCE(is_archived, 0) = 0 LIMIT 1),
        (SELECT id FROM agencies WHERE LOWER(COALESCE(slug, portal_url, '')) = 'ssc' AND COALESCE(is_archived, 0) = 0 LIMIT 1),
        (SELECT MIN(id) FROM agencies
         WHERE LOWER(COALESCE(organization_type, 'agency')) = 'agency'
           AND COALESCE(is_archived, 0) = 0
           AND (
             LOWER(TRIM(name)) LIKE 'summit stats%'
             OR LOWER(COALESCE(slug, portal_url, '')) IN ('sstc', 'ssc', 'summit-stats')
           )
        )
      ) AS keep_id
    ) kept
    WHERE keep_id IS NOT NULL
  );

-- If both sstc and ssc are still active, keep sstc and archive ssc
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
    ) t
  );

-- "Counseling and Therapy" is a generic label, not a real tenant for Gear management
UPDATE agencies
SET
  is_archived = 1,
  is_active = 0,
  updated_at = CURRENT_TIMESTAMP
WHERE LOWER(TRIM(name)) = 'counseling and therapy'
  AND LOWER(COALESCE(organization_type, 'agency')) = 'agency'
  AND COALESCE(is_archived, 0) = 0;
