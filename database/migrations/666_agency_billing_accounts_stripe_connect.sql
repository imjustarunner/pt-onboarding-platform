-- Migration 666: Add Stripe Connect columns to agency_billing_accounts.
-- Each agency can connect their own Stripe Express account so that parent/guardian
-- payments go directly to that agency's bank account via Stripe Connect.

ALTER TABLE agency_billing_accounts
  ADD COLUMN stripe_connect_account_id VARCHAR(255) NULL
    COMMENT 'Stripe Express connected account ID (acct_xxx) for this agency',
  ADD COLUMN stripe_connect_status ENUM('not_connected','pending','active') NOT NULL DEFAULT 'not_connected'
    COMMENT 'Tracks Stripe Connect onboarding state for this agency',
  ADD KEY idx_aba_stripe_account (stripe_connect_account_id);
