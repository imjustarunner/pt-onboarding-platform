-- Set platform organization logo icon to the platform icon library entry named "MainLogo5"
-- when that icon exists. Does not clear URL or upload path; those take precedence in the app
-- if still set. Safe no-op when the icon name is missing.

UPDATE platform_branding
SET organization_logo_icon_id = (
  SELECT i.id
  FROM icons i
  WHERE i.name = 'MainLogo5'
    AND (i.agency_id IS NULL OR i.agency_id <=> NULL)
  ORDER BY i.id
  LIMIT 1
)
WHERE EXISTS (
  SELECT 1
  FROM icons i2
  WHERE i2.name = 'MainLogo5'
    AND (i2.agency_id IS NULL OR i2.agency_id <=> NULL)
);
