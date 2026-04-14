-- Migration 689: Billing rollout controls + feature entitlements
-- Purpose:
-- 1) Let super admins keep billing in a "coming soon" state per tenant until rollout is intentional
-- 2) Store per-tenant billable feature availability / selection metadata separate from pricing overrides

SET @billing_rollout_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'agency_billing_accounts'
    AND COLUMN_NAME = 'billing_rollout_json'
);
SET @billing_rollout_sql := IF(
  @billing_rollout_exists = 0,
  'ALTER TABLE agency_billing_accounts ADD COLUMN billing_rollout_json JSON NULL COMMENT ''Billing rollout state for this tenant, e.g. {status:"coming_soon"|"active", comingSoonMessage, activatedAt}''',
  'SELECT 1'
);
PREPARE billing_rollout_stmt FROM @billing_rollout_sql;
EXECUTE billing_rollout_stmt;
DEALLOCATE PREPARE billing_rollout_stmt;

SET @feature_entitlements_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'agency_billing_accounts'
    AND COLUMN_NAME = 'feature_entitlements_json'
);
SET @feature_entitlements_sql := IF(
  @feature_entitlements_exists = 0,
  'ALTER TABLE agency_billing_accounts ADD COLUMN feature_entitlements_json JSON NULL COMMENT ''Per-tenant billable feature availability and selection state''',
  'SELECT 1'
);
PREPARE feature_entitlements_stmt FROM @feature_entitlements_sql;
EXECUTE feature_entitlements_stmt;
DEALLOCATE PREPARE feature_entitlements_stmt;
