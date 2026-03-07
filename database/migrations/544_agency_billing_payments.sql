-- Migration: agency billing payments + QuickBooks Payments readiness fields
-- Purpose:
-- 1) Track processor-backed agency billing payments and attempt history
-- 2) Persist granted QuickBooks scopes/payment readiness metadata
-- 3) Track invoice email-delivery state for manual/fallback collection

ALTER TABLE agency_billing_accounts
  ADD COLUMN qbo_scope_csv TEXT NULL AFTER qbo_token_expires_at,
  ADD COLUMN qbo_payments_enabled BOOLEAN NOT NULL DEFAULT FALSE AFTER is_qbo_connected,
  ADD COLUMN qbo_payments_merchant_id VARCHAR(64) NULL AFTER qbo_service_item_id;

ALTER TABLE agency_billing_invoices
  ADD COLUMN invoice_delivery_status VARCHAR(32) NOT NULL DEFAULT 'not_sent' AFTER invoice_delivery_mode,
  ADD COLUMN invoice_sent_at DATETIME NULL AFTER invoice_delivery_status;

CREATE TABLE IF NOT EXISTS agency_billing_payments (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  invoice_id INT NOT NULL,
  payment_method_id BIGINT NULL,
  amount_cents INT NOT NULL DEFAULT 0,
  currency CHAR(3) NOT NULL DEFAULT 'USD',
  payment_status ENUM('PENDING','PROCESSING','SUCCEEDED','FAILED','VOIDED','REFUNDED') NOT NULL DEFAULT 'PENDING',
  processor VARCHAR(40) NOT NULL DEFAULT 'UNSET',
  processor_customer_id VARCHAR(128) NULL,
  processor_payment_method_id VARCHAR(128) NULL,
  processor_charge_id VARCHAR(128) NULL,
  processor_reference_id VARCHAR(128) NULL,
  processor_status VARCHAR(64) NULL,
  initiated_at DATETIME NULL,
  authorized_at DATETIME NULL,
  captured_at DATETIME NULL,
  failed_at DATETIME NULL,
  failure_code VARCHAR(120) NULL,
  failure_message VARCHAR(255) NULL,
  idempotency_key VARCHAR(128) NULL,
  metadata_json JSON NULL,
  created_by_user_id INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_agency_billing_payments_idempotency (idempotency_key),
  KEY idx_abp_agency_created (agency_id, created_at),
  KEY idx_abp_invoice (invoice_id),
  KEY idx_abp_status (payment_status, created_at),
  CONSTRAINT fk_abp_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_abp_invoice FOREIGN KEY (invoice_id) REFERENCES agency_billing_invoices(id) ON DELETE CASCADE,
  CONSTRAINT fk_abp_method FOREIGN KEY (payment_method_id) REFERENCES agency_billing_payment_methods(id) ON DELETE SET NULL,
  CONSTRAINT fk_abp_created_by FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS agency_billing_payment_attempts (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  payment_id BIGINT NOT NULL,
  attempt_no INT NOT NULL,
  request_payload_json JSON NULL,
  response_payload_json JSON NULL,
  processor_status VARCHAR(64) NULL,
  result_status ENUM('SUCCESS','FAILED','PENDING') NOT NULL DEFAULT 'PENDING',
  error_message VARCHAR(255) NULL,
  attempted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_agency_billing_payment_attempts_payment_no (payment_id, attempt_no),
  KEY idx_abpa_result (result_status, attempted_at),
  CONSTRAINT fk_abpa_payment FOREIGN KEY (payment_id) REFERENCES agency_billing_payments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
