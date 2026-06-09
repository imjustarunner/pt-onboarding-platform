-- Migration 855: Percent-of-client-paid payroll pay method
-- Enables agencies to pay providers a percentage of what the client actually paid
-- (billing report "Patient Amount Paid") per service code, with agency default
-- and optional per-user overrides.

ALTER TABLE agencies
  ADD COLUMN percentage_pay_policy_json JSON NULL
    COMMENT 'Agency default percent-of-charge settings: { defaultPercent }';

ALTER TABLE payroll_service_code_rules
  ADD COLUMN pay_method ENUM('fixed_rate','percent_of_charge') NOT NULL DEFAULT 'fixed_rate'
    COMMENT 'Pay calculation method for this code when percent-of-client-paid pay is enabled',
  ADD COLUMN pay_percent DECIMAL(6,2) NULL
    COMMENT 'Percent of client-paid amount for this code; null falls back to agency default';

ALTER TABLE payroll_rates
  ADD COLUMN pay_percent DECIMAL(6,2) NULL
    COMMENT 'Per-user override percent of charge for this service code'
    AFTER rate_amount;

ALTER TABLE payroll_import_rows
  ADD COLUMN client_paid_amount DECIMAL(12,2) NULL
    COMMENT 'Billing report Patient Amount Paid column (column AE in standard export)'
    AFTER amount_collected;
