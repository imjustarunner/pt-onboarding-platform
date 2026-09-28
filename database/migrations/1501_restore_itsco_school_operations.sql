-- Restore ITSCO's school portal entitlement after its baseline profile disabled it.
-- Finance Operations belongs to separately opted-in organizations, not ITSCO.
-- Preserve every other feature and the existing finance records/permissions.
UPDATE agencies
SET feature_flags = JSON_SET(
      COALESCE(feature_flags, JSON_OBJECT()),
      '$.schoolPortalsEnabled', CAST('true' AS JSON),
      '$.financeOperationsEnabled', CAST('false' AS JSON),
      '$.tenantFeatureProfileKey', 'custom'
    ),
    tenant_available_agency_features_json = CASE
      WHEN tenant_available_agency_features_json IS NULL THEN NULL
      ELSE JSON_SET(tenant_available_agency_features_json, '$.schoolPortalsEnabled', CAST('true' AS JSON))
    END
WHERE organization_type = 'agency'
  AND (LOWER(TRIM(slug)) = 'itsco' OR LOWER(TRIM(portal_url)) = 'itsco');
