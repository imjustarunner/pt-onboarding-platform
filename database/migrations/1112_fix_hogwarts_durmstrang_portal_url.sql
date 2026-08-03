-- Migration 1112: Fix Hogwarts / Durmstrang portal_url swap
-- Durmstrang incorrectly held portal_url 'hogwarts', so /hogwarts/login showed Durmstrang branding.

SET @hogwarts_id = (
  SELECT id FROM agencies
  WHERE slug = 'hogwarts' AND organization_type = 'school'
  LIMIT 1
);

SET @durmstrang_id = (
  SELECT id FROM agencies
  WHERE slug = 'durmstrang' AND organization_type = 'school'
  LIMIT 1
);

-- Clear the conflicting hogwarts portal_url first (unique index on portal_url).
UPDATE agencies
SET portal_url = NULL
WHERE @durmstrang_id IS NOT NULL
  AND id = @durmstrang_id
  AND LOWER(TRIM(COALESCE(portal_url, ''))) = 'hogwarts';

UPDATE agencies
SET portal_url = 'hogwarts'
WHERE @hogwarts_id IS NOT NULL
  AND id = @hogwarts_id
  AND (portal_url IS NULL OR LOWER(TRIM(portal_url)) <> 'hogwarts');

UPDATE agencies
SET portal_url = 'durmstrang'
WHERE @durmstrang_id IS NOT NULL
  AND id = @durmstrang_id
  AND (portal_url IS NULL OR LOWER(TRIM(portal_url)) <> 'durmstrang');
