-- Migration 1106: Focus Music add-on — grandfather existing tenants at $0, enable for all current agencies

UPDATE agencies
SET feature_flags = JSON_SET(
  COALESCE(feature_flags, JSON_OBJECT()),
  '$.focusMusicEnabled',
  TRUE
);

INSERT INTO agency_feature_entitlement_events
  (agency_id, feature_key, event_type, actor_user_id, actor_role, effective_at, notes)
SELECT id, 'focusMusic', 'enabled', NULL, 'system', NOW(),
       'Grandfathered Focus Music at $0 for existing tenants (migration 1106)'
FROM agencies;

UPDATE agency_billing_accounts aba
SET pricing_override_json = JSON_SET(
  COALESCE(aba.pricing_override_json, JSON_OBJECT()),
  '$.featureCatalog.focusMusic.tenantMonthlyCents',
  0,
  '$.featureCatalog.focusMusic.userMonthlyCents',
  0
);
