-- Migration 612: Add self-pay pricing fields to company_events
-- Adds program_cost_billing_mode, program_cost_dollars, per_session_cost_dollars
-- so admins can specify how cash/self-pay families are charged.

ALTER TABLE company_events
  ADD COLUMN program_cost_billing_mode VARCHAR(32) NULL DEFAULT 'total'
    COMMENT 'total = one total fee for the program, per_session = charged each session',
  ADD COLUMN program_cost_dollars DECIMAL(10, 2) NULL DEFAULT NULL
    COMMENT 'Total program cost for self-pay families (billing_mode = total)',
  ADD COLUMN per_session_cost_dollars DECIMAL(10, 2) NULL DEFAULT NULL
    COMMENT 'Cost per session for self-pay families (billing_mode = per_session)';
