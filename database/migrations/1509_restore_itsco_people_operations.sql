-- Rachel and other ITSCO admins retain hiring capabilities, but the baseline
-- feature profile disabled Hiring and dropped People Operations from navigation.
-- Restore these tenant features without changing anyone's role or other modules.
UPDATE agencies
SET feature_flags = JSON_SET(
      COALESCE(feature_flags, JSON_OBJECT()),
      '$.hiringEnabled', CAST('true' AS JSON),
      '$.peopleOpsEnabled', CAST('true' AS JSON),
      '$.tenantFeatureProfileKey', 'custom'
    )
WHERE organization_type = 'agency'
  AND (LOWER(TRIM(slug)) = 'itsco' OR LOWER(TRIM(portal_url)) = 'itsco');
