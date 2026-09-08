-- Migration 1396: Opt-in missed-event billing override per medical service code
-- Default is none — no-show / late cancel never create insurance claims unless configured.

ALTER TABLE agency_medical_service_codes
  ADD COLUMN missed_billing_mode VARCHAR(32) NOT NULL DEFAULT 'none'
  COMMENT 'none|fee_ledger_only|secondary_claim_draft',
  ADD COLUMN missed_billing_service_code VARCHAR(32) NULL DEFAULT NULL
  COMMENT 'Optional CPT/HCPCS used for secondary missed-fee claim draft (not the original session code)',
  ADD COLUMN missed_billing_triggers VARCHAR(64) NOT NULL DEFAULT 'no_show,late_cancel'
  COMMENT 'Comma list: no_show,late_cancel';
