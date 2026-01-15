-- Migration: Create agency_billing_invoices table
-- Purpose: Snapshot monthly usage + pricing, store generated PDF, and track QBO sync status

CREATE TABLE IF NOT EXISTS agency_billing_invoices (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,

  -- Usage snapshot
  schools_used INT NOT NULL DEFAULT 0,
  programs_used INT NOT NULL DEFAULT 0,
  admins_used INT NOT NULL DEFAULT 0,
  active_onboardees_used INT NOT NULL DEFAULT 0,

  -- Pricing snapshot (cents)
  base_fee_cents INT NOT NULL,
  extra_schools_cents INT NOT NULL DEFAULT 0,
  extra_programs_cents INT NOT NULL DEFAULT 0,
  extra_admins_cents INT NOT NULL DEFAULT 0,
  extra_onboardees_cents INT NOT NULL DEFAULT 0,
  total_cents INT NOT NULL,

  -- Full line items breakdown for auditability
  line_items_json JSON NOT NULL,

  -- QuickBooks sync fields
  qbo_bill_id VARCHAR(64) NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'draft',
  error_message TEXT NULL,

  -- Platform invoice PDF storage (GCS object key)
  pdf_storage_path VARCHAR(500) NULL,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  INDEX idx_agency_period (agency_id, period_start, period_end),
  INDEX idx_status (status)
);

