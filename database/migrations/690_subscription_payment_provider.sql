-- Migration 690: Allow tenant subscription billing to choose QuickBooks or Stripe.

SET @subscription_provider_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'agency_billing_accounts'
    AND COLUMN_NAME = 'subscription_payment_provider'
);
SET @subscription_provider_sql := IF(
  @subscription_provider_exists = 0,
  'ALTER TABLE agency_billing_accounts ADD COLUMN subscription_payment_provider VARCHAR(40) NOT NULL DEFAULT ''QUICKBOOKS'' COMMENT ''Provider used for tenant subscription billing: QUICKBOOKS or STRIPE'' AFTER subscription_merchant_mode',
  'SELECT 1'
);
PREPARE subscription_provider_stmt FROM @subscription_provider_sql;
EXECUTE subscription_provider_stmt;
DEALLOCATE PREPARE subscription_provider_stmt;
