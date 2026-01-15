-- Migration: Create agency_billing_accounts table
-- Purpose: Store billing settings and per-agency QuickBooks Online OAuth connection data

CREATE TABLE IF NOT EXISTS agency_billing_accounts (
  agency_id INT PRIMARY KEY,
  billing_email VARCHAR(255) NULL,

  -- QuickBooks Online (QBO) connection (per-agency)
  qbo_realm_id VARCHAR(64) NULL,
  qbo_access_token_enc JSON NULL COMMENT 'Encrypted JSON payload {ciphertextB64,ivB64,authTagB64,keyId}',
  qbo_refresh_token_enc JSON NULL COMMENT 'Encrypted JSON payload {ciphertextB64,ivB64,authTagB64,keyId}',
  qbo_token_expires_at DATETIME NULL,
  is_qbo_connected BOOLEAN NOT NULL DEFAULT FALSE,

  -- QBO entity identifiers for billing sync
  qbo_vendor_id VARCHAR(64) NULL COMMENT 'PlotTwist vendor ID in the agency QBO company',
  qbo_bill_id_prefix VARCHAR(32) NULL,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  INDEX idx_qbo_realm_id (qbo_realm_id)
);

