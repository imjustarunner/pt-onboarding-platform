-- Migration: Twilio agency billing ledger, payment methods, and AR invoice sync fields
-- Purpose:
-- 1) Store normalized communications usage events for monthly invoicing
-- 2) Add agency billing payment methods + autopay settings
-- 3) Extend billing invoices for communications subtotals and customer-facing QuickBooks sync

CREATE TABLE IF NOT EXISTS agency_billing_payment_methods (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  provider VARCHAR(32) NOT NULL DEFAULT 'PLACEHOLDER',
  provider_customer_id VARCHAR(128) NULL,
  provider_payment_method_id VARCHAR(128) NULL,
  card_brand VARCHAR(40) NULL,
  last4 VARCHAR(4) NULL,
  exp_month INT NULL,
  exp_year INT NULL,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  token_encrypted JSON NULL,
  created_by_user_id INT NULL,
  updated_by_user_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_abpm_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_abpm_created_by FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_abpm_updated_by FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_abpm_agency_default (agency_id, is_default, is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE agency_billing_accounts
  ADD COLUMN autopay_enabled BOOLEAN NOT NULL DEFAULT FALSE AFTER billing_email,
  ADD COLUMN payment_processor VARCHAR(32) NULL AFTER autopay_enabled,
  ADD COLUMN payment_customer_ref VARCHAR(128) NULL AFTER payment_processor,
  ADD COLUMN qbo_customer_id VARCHAR(64) NULL AFTER qbo_vendor_id,
  ADD COLUMN qbo_service_item_id VARCHAR(64) NULL AFTER qbo_customer_id;

ALTER TABLE agency_billing_invoices
  ADD COLUMN communication_actual_cost_cents INT NOT NULL DEFAULT 0 AFTER extra_onboardees_cents,
  ADD COLUMN communication_markup_cents INT NOT NULL DEFAULT 0 AFTER communication_actual_cost_cents,
  ADD COLUMN communication_subtotal_cents INT NOT NULL DEFAULT 0 AFTER communication_markup_cents,
  ADD COLUMN payment_status VARCHAR(32) NOT NULL DEFAULT 'unpaid' AFTER status,
  ADD COLUMN payment_method_id BIGINT NULL AFTER payment_status,
  ADD COLUMN payment_reference VARCHAR(128) NULL AFTER payment_method_id,
  ADD COLUMN paid_at DATETIME NULL AFTER payment_reference,
  ADD COLUMN auto_charge_attempted_at DATETIME NULL AFTER paid_at,
  ADD COLUMN qbo_invoice_id VARCHAR(64) NULL AFTER qbo_bill_id,
  ADD COLUMN qbo_payment_id VARCHAR(64) NULL AFTER qbo_invoice_id,
  ADD COLUMN invoice_delivery_mode VARCHAR(32) NOT NULL DEFAULT 'manual' AFTER qbo_payment_id,
  ADD CONSTRAINT fk_abi_payment_method FOREIGN KEY (payment_method_id) REFERENCES agency_billing_payment_methods(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS agency_communication_usage_ledger (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  invoice_id INT NULL,
  source_key VARCHAR(191) NOT NULL,
  source_type VARCHAR(64) NOT NULL,
  source_id BIGINT NULL,
  event_type VARCHAR(64) NOT NULL,
  usage_quantity DECIMAL(12,4) NOT NULL DEFAULT 0,
  usage_unit VARCHAR(32) NOT NULL DEFAULT 'count',
  currency CHAR(3) NOT NULL DEFAULT 'USD',
  actual_cost_cents INT NOT NULL DEFAULT 0,
  markup_cents INT NOT NULL DEFAULT 0,
  billable_amount_cents INT NOT NULL DEFAULT 0,
  occurred_at DATETIME NOT NULL,
  billing_period_start DATE NOT NULL,
  billing_period_end DATE NOT NULL,
  is_invoiced BOOLEAN NOT NULL DEFAULT FALSE,
  metadata_json JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_acul_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_acul_invoice FOREIGN KEY (invoice_id) REFERENCES agency_billing_invoices(id) ON DELETE SET NULL,
  UNIQUE KEY uq_acul_source_key (source_key),
  INDEX idx_acul_agency_period (agency_id, billing_period_start, billing_period_end),
  INDEX idx_acul_agency_event (agency_id, event_type, occurred_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
