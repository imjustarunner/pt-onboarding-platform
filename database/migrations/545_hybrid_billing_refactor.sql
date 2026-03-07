-- Migration: hybrid billing connections and merchant-mode support
-- Purpose:
-- 1) Separate provider connection ownership from agency billing rows
-- 2) Allow subscription billing to use either platform-managed or agency-managed merchant accounts
-- 3) Add billing-domain scaffolding for future client/guardian payment flows

CREATE TABLE IF NOT EXISTS billing_provider_connections (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  owner_type ENUM('platform', 'agency') NOT NULL,
  owner_id BIGINT NOT NULL DEFAULT 0,
  provider VARCHAR(40) NOT NULL DEFAULT 'QUICKBOOKS',
  connection_label VARCHAR(120) NULL,
  is_connected BOOLEAN NOT NULL DEFAULT FALSE,
  qbo_realm_id VARCHAR(64) NULL,
  qbo_access_token_enc JSON NULL,
  qbo_refresh_token_enc JSON NULL,
  qbo_token_expires_at DATETIME NULL,
  qbo_scope_csv TEXT NULL,
  qbo_payments_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  qbo_payments_merchant_id VARCHAR(64) NULL,
  qbo_default_service_item_id VARCHAR(64) NULL,
  qbo_default_income_account_id VARCHAR(64) NULL,
  qbo_default_deposit_account_id VARCHAR(64) NULL,
  metadata_json JSON NULL,
  created_by_user_id INT NULL,
  updated_by_user_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_bpc_owner_provider (owner_type, owner_id, provider),
  KEY idx_bpc_provider_connected (provider, is_connected),
  CONSTRAINT fk_bpc_created_by FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_bpc_updated_by FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE agency_billing_accounts
  ADD COLUMN subscription_merchant_mode ENUM('agency_managed', 'platform_managed') NOT NULL DEFAULT 'agency_managed' AFTER autopay_enabled,
  ADD COLUMN subscription_provider_connection_id BIGINT NULL AFTER subscription_merchant_mode,
  ADD COLUMN client_payments_mode ENUM('not_configured', 'agency_managed', 'platform_managed') NOT NULL DEFAULT 'not_configured' AFTER subscription_provider_connection_id,
  ADD COLUMN client_payments_provider_connection_id BIGINT NULL AFTER client_payments_mode,
  ADD CONSTRAINT fk_aba_subscription_provider_connection FOREIGN KEY (subscription_provider_connection_id) REFERENCES billing_provider_connections(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_aba_client_payments_provider_connection FOREIGN KEY (client_payments_provider_connection_id) REFERENCES billing_provider_connections(id) ON DELETE SET NULL;

ALTER TABLE agency_billing_payment_methods
  ADD COLUMN billing_domain ENUM('agency_subscription', 'client_guardian_payment') NOT NULL DEFAULT 'agency_subscription' AFTER agency_id,
  ADD COLUMN merchant_mode ENUM('agency_managed', 'platform_managed') NOT NULL DEFAULT 'agency_managed' AFTER billing_domain,
  ADD COLUMN provider_connection_id BIGINT NULL AFTER provider,
  ADD CONSTRAINT fk_abpm_provider_connection FOREIGN KEY (provider_connection_id) REFERENCES billing_provider_connections(id) ON DELETE SET NULL;

ALTER TABLE agency_billing_invoices
  ADD COLUMN billing_domain ENUM('agency_subscription', 'client_guardian_payment') NOT NULL DEFAULT 'agency_subscription' AFTER agency_id,
  ADD COLUMN merchant_mode ENUM('agency_managed', 'platform_managed') NOT NULL DEFAULT 'agency_managed' AFTER billing_domain,
  ADD COLUMN provider_connection_id BIGINT NULL AFTER merchant_mode,
  ADD CONSTRAINT fk_abi_provider_connection FOREIGN KEY (provider_connection_id) REFERENCES billing_provider_connections(id) ON DELETE SET NULL;

ALTER TABLE agency_billing_payments
  ADD COLUMN billing_domain ENUM('agency_subscription', 'client_guardian_payment') NOT NULL DEFAULT 'agency_subscription' AFTER agency_id,
  ADD COLUMN merchant_mode ENUM('agency_managed', 'platform_managed') NOT NULL DEFAULT 'agency_managed' AFTER billing_domain,
  ADD COLUMN provider_connection_id BIGINT NULL AFTER processor,
  ADD CONSTRAINT fk_abp_provider_connection FOREIGN KEY (provider_connection_id) REFERENCES billing_provider_connections(id) ON DELETE SET NULL;

ALTER TABLE agency_billing_payment_attempts
  ADD COLUMN billing_domain ENUM('agency_subscription', 'client_guardian_payment') NOT NULL DEFAULT 'agency_subscription' AFTER payment_id,
  ADD COLUMN merchant_mode ENUM('agency_managed', 'platform_managed') NOT NULL DEFAULT 'agency_managed' AFTER billing_domain,
  ADD COLUMN provider_connection_id BIGINT NULL AFTER merchant_mode,
  ADD CONSTRAINT fk_abpa_provider_connection FOREIGN KEY (provider_connection_id) REFERENCES billing_provider_connections(id) ON DELETE SET NULL;

INSERT INTO billing_provider_connections
  (owner_type, owner_id, provider, connection_label, is_connected,
   qbo_realm_id, qbo_access_token_enc, qbo_refresh_token_enc, qbo_token_expires_at,
   qbo_scope_csv, qbo_payments_enabled, qbo_payments_merchant_id, qbo_default_service_item_id)
SELECT
  'agency' AS owner_type,
  aba.agency_id AS owner_id,
  'QUICKBOOKS' AS provider,
  CONCAT('Agency ', aba.agency_id, ' QuickBooks') AS connection_label,
  COALESCE(aba.is_qbo_connected, FALSE) AS is_connected,
  aba.qbo_realm_id,
  aba.qbo_access_token_enc,
  aba.qbo_refresh_token_enc,
  aba.qbo_token_expires_at,
  aba.qbo_scope_csv,
  COALESCE(aba.qbo_payments_enabled, FALSE) AS qbo_payments_enabled,
  aba.qbo_payments_merchant_id,
  aba.qbo_service_item_id
FROM agency_billing_accounts aba
WHERE aba.qbo_realm_id IS NOT NULL
   OR aba.qbo_access_token_enc IS NOT NULL
   OR COALESCE(aba.is_qbo_connected, FALSE) = TRUE
ON DUPLICATE KEY UPDATE
  connection_label = VALUES(connection_label),
  is_connected = VALUES(is_connected),
  qbo_realm_id = VALUES(qbo_realm_id),
  qbo_access_token_enc = VALUES(qbo_access_token_enc),
  qbo_refresh_token_enc = VALUES(qbo_refresh_token_enc),
  qbo_token_expires_at = VALUES(qbo_token_expires_at),
  qbo_scope_csv = VALUES(qbo_scope_csv),
  qbo_payments_enabled = VALUES(qbo_payments_enabled),
  qbo_payments_merchant_id = VALUES(qbo_payments_merchant_id),
  qbo_default_service_item_id = VALUES(qbo_default_service_item_id),
  updated_at = CURRENT_TIMESTAMP;

UPDATE agency_billing_accounts aba
JOIN billing_provider_connections bpc
  ON bpc.owner_type = 'agency'
 AND bpc.owner_id = aba.agency_id
 AND bpc.provider = 'QUICKBOOKS'
SET aba.subscription_provider_connection_id = bpc.id
WHERE aba.subscription_merchant_mode = 'agency_managed';

UPDATE agency_billing_payment_methods abpm
JOIN agency_billing_accounts aba ON aba.agency_id = abpm.agency_id
LEFT JOIN billing_provider_connections bpc
  ON bpc.owner_type = 'agency'
 AND bpc.owner_id = abpm.agency_id
 AND bpc.provider = 'QUICKBOOKS'
SET abpm.billing_domain = 'agency_subscription',
    abpm.merchant_mode = COALESCE(aba.subscription_merchant_mode, 'agency_managed'),
    abpm.provider_connection_id = COALESCE(abpm.provider_connection_id, bpc.id);

UPDATE agency_billing_invoices abi
JOIN agency_billing_accounts aba ON aba.agency_id = abi.agency_id
LEFT JOIN billing_provider_connections bpc
  ON bpc.owner_type = 'agency'
 AND bpc.owner_id = abi.agency_id
 AND bpc.provider = 'QUICKBOOKS'
SET abi.billing_domain = 'agency_subscription',
    abi.merchant_mode = COALESCE(aba.subscription_merchant_mode, 'agency_managed'),
    abi.provider_connection_id = COALESCE(abi.provider_connection_id, bpc.id);

UPDATE agency_billing_payments abp
JOIN agency_billing_accounts aba ON aba.agency_id = abp.agency_id
LEFT JOIN billing_provider_connections bpc
  ON bpc.owner_type = 'agency'
 AND bpc.owner_id = abp.agency_id
 AND bpc.provider = 'QUICKBOOKS'
SET abp.billing_domain = 'agency_subscription',
    abp.merchant_mode = COALESCE(aba.subscription_merchant_mode, 'agency_managed'),
    abp.provider_connection_id = COALESCE(abp.provider_connection_id, bpc.id);

UPDATE agency_billing_payment_attempts abpa
JOIN agency_billing_payments abp ON abp.id = abpa.payment_id
SET abpa.billing_domain = COALESCE(abpa.billing_domain, abp.billing_domain),
    abpa.merchant_mode = COALESCE(abpa.merchant_mode, abp.merchant_mode),
    abpa.provider_connection_id = COALESCE(abpa.provider_connection_id, abp.provider_connection_id);
