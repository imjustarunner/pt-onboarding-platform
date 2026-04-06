-- Migration 664: Rename Stripe column placeholders in club_billing_accounts to
-- QuickBooks-aligned names. The app uses QuickBooks (Intuit) for billing, not Stripe.
--
-- stripe_customer_id  → qb_customer_id        (QuickBooks Payments customerId)
-- stripe_subscription_id → qb_subscription_ref (future QuickBooks recurring billing ref)

ALTER TABLE club_billing_accounts
  CHANGE COLUMN stripe_customer_id     qb_customer_id     VARCHAR(255) NULL,
  CHANGE COLUMN stripe_subscription_id qb_subscription_ref VARCHAR(255) NULL;
