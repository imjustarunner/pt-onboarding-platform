-- Migration 857: Per-user percent-of-charge pay toggle
-- Adds a flag to payroll_rate_cards so admins can enable the % rate
-- column on a per-employee basis (only shown when agency feature is also on).
ALTER TABLE payroll_rate_cards
  ADD COLUMN percent_pay_enabled TINYINT(1) NOT NULL DEFAULT 0
    COMMENT '1 = show percent-of-charge pay fields on this user\'s rate card';
