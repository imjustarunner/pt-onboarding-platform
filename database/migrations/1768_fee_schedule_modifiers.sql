-- Migration 1768: modifier defaults live on the same fee-schedule ledger as charges.
ALTER TABLE medical_fee_schedule_rates
  MODIFY COLUMN record_type ENUM('rate','visibility','modifier') NOT NULL DEFAULT 'rate',
  ADD COLUMN modifiers_json JSON NULL AFTER is_hidden;

ALTER TABLE billing_claim_overrides
  ADD COLUMN service_code VARCHAR(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL AFTER field_key;
