-- Migration 858: Per-user PTO pay rate
-- Adds an optional per-user override for the PTO pay rate ($/hr).
-- NULL means fall back to the agency-level pto_default_pay_rate.
ALTER TABLE payroll_pto_accounts
  ADD COLUMN pto_pay_rate DECIMAL(12,2) NULL DEFAULT NULL
    COMMENT 'Per-user PTO pay rate ($/hr). NULL = use agency default.';
