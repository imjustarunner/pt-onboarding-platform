-- Migration: Agency PTO policy settings
-- Description: Store agency-level PTO policy configuration and default PTO pay rate.

ALTER TABLE agencies
  ADD COLUMN pto_policy_json JSON NULL,
  ADD COLUMN pto_default_pay_rate DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN pto_enabled TINYINT(1) NOT NULL DEFAULT 1;

