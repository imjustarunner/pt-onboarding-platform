-- Migration 905: clean duplicate Summit Stats tenant + empty Tutoring learning org
-- Keep canonical Summit product tenant: slug sstc (rename display to Team Challenge).
-- Archive empty duplicate slug ssc. Archive unused NLU learning org slug tutoring.
-- Do NOT touch tplust (Therapy + Tutoring program under NLU).

-- Canonical display name for the live Summit product tenant
UPDATE agencies
SET
  name = 'Summit Stats Team Challenge',
  official_name = COALESCE(NULLIF(TRIM(official_name), ''), 'Summit Stats Team Challenge'),
  updated_at = CURRENT_TIMESTAMP
WHERE slug = 'sstc'
  AND COALESCE(is_archived, 0) = 0;

-- Empty duplicate created later (0 users) — soft-archive out of platform lists
UPDATE agencies
SET
  is_archived = 1,
  is_active = 0,
  updated_at = CURRENT_TIMESTAMP
WHERE slug = 'ssc'
  AND COALESCE(is_archived, 0) = 0;

-- Unused learning sub-org under Next Level Up (0 users) — archive + deactivate affiliation
UPDATE organization_affiliations oa
INNER JOIN agencies child ON child.id = oa.organization_id
SET oa.is_active = 0
WHERE child.slug = 'tutoring'
  AND LOWER(COALESCE(child.organization_type, '')) = 'learning';

UPDATE agencies
SET
  is_archived = 1,
  is_active = 0,
  updated_at = CURRENT_TIMESTAMP
WHERE slug = 'tutoring'
  AND LOWER(COALESCE(organization_type, '')) = 'learning'
  AND COALESCE(is_archived, 0) = 0;
