-- Migration 1372: first+last-initial username default; Haley as default hiring manager signer

UPDATE agencies
SET feature_flags = JSON_SET(
  COALESCE(feature_flags, JSON_OBJECT()),
  '$.workspaceEmailFormat', 'first_last_initial'
)
WHERE (
  LOWER(COALESCE(slug, '')) LIKE '%itsco%'
  OR LOWER(COALESCE(portal_url, '')) LIKE '%itsco%'
  OR LOWER(COALESCE(name, '')) LIKE '%itsco%'
  OR LOWER(COALESCE(official_name, '')) LIKE '%itsco%'
);

-- Prefer Haley Inyart (haley@plottwistco.com) as default Hiring Manager signer when unset
UPDATE hiring_signer_roles hsr
INNER JOIN agencies a ON a.id = hsr.agency_id
INNER JOIN users u ON LOWER(TRIM(u.email)) = 'haley@plottwistco.com'
SET hsr.default_user_id = u.id
WHERE hsr.default_user_id IS NULL
  AND (
    LOWER(COALESCE(hsr.role_label, '')) LIKE '%hiring manager%'
    OR LOWER(COALESCE(hsr.role_label, '')) LIKE '%hiring%'
    OR hsr.sort_order = 0
  )
  AND (
    LOWER(COALESCE(a.slug, '')) LIKE '%itsco%'
    OR LOWER(COALESCE(a.portal_url, '')) LIKE '%itsco%'
    OR LOWER(COALESCE(a.name, '')) LIKE '%itsco%'
    OR LOWER(COALESCE(a.official_name, '')) LIKE '%itsco%'
  );

-- If no hiring_signer_roles exist for ITSCO, seed Hiring Manager → Haley
INSERT INTO hiring_signer_roles (agency_id, role_label, default_user_id, sort_order)
SELECT a.id, 'Hiring Manager', u.id, 0
FROM agencies a
CROSS JOIN users u
WHERE LOWER(TRIM(u.email)) = 'haley@plottwistco.com'
  AND (
    LOWER(COALESCE(a.slug, '')) LIKE '%itsco%'
    OR LOWER(COALESCE(a.portal_url, '')) LIKE '%itsco%'
    OR LOWER(COALESCE(a.name, '')) LIKE '%itsco%'
    OR LOWER(COALESCE(a.official_name, '')) LIKE '%itsco%'
  )
  AND NOT EXISTS (
    SELECT 1 FROM hiring_signer_roles hsr WHERE hsr.agency_id = a.id
  );
