-- Migration 1107: Focus Music billing — $40/mo catalog, $0 override + enabled for all current tenants

UPDATE agency_billing_accounts aba
SET pricing_override_json = JSON_SET(
      COALESCE(aba.pricing_override_json, JSON_OBJECT()),
      '$.featureCatalog.focusMusic.tenantMonthlyCents',
      0,
      '$.featureCatalog.focusMusic.userMonthlyCents',
      0
    ),
    feature_entitlements_json = JSON_SET(
      COALESCE(aba.feature_entitlements_json, JSON_OBJECT()),
      '$.focusMusic.enabled',
      TRUE,
      '$.focusMusic.available',
      TRUE,
      '$.focusMusic.unitAmountCents',
      0
    );

-- Ensure flag stays on for any agency missed by 1106.
UPDATE agencies
SET feature_flags = JSON_SET(
  COALESCE(feature_flags, JSON_OBJECT()),
  '$.focusMusicEnabled',
  TRUE
)
WHERE JSON_EXTRACT(feature_flags, '$.focusMusicEnabled') IS NULL
   OR JSON_UNQUOTE(JSON_EXTRACT(feature_flags, '$.focusMusicEnabled')) IN ('false', '0');
