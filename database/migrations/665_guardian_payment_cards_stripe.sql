-- Migration 665: Add Stripe payment columns to guardian_payment_cards.
-- The qb_* columns are preserved so existing QuickBooks Payments data is untouched.
-- payment_provider indicates which gateway stored the card for this row.

ALTER TABLE guardian_payment_cards
  ADD COLUMN payment_provider   ENUM('QUICKBOOKS_PAYMENTS','STRIPE') NOT NULL DEFAULT 'QUICKBOOKS_PAYMENTS' AFTER agency_id,
  ADD COLUMN stripe_customer_id VARCHAR(255) NULL AFTER qb_card_id,
  ADD COLUMN stripe_payment_method_id VARCHAR(255) NULL AFTER stripe_customer_id,
  ADD KEY idx_gpc_stripe_customer (stripe_customer_id);

-- Allow qb_card_id to be nullable so Stripe rows don't need a fake QB id
ALTER TABLE guardian_payment_cards
  MODIFY COLUMN qb_card_id VARCHAR(255) NULL COMMENT 'QuickBooks Payments card entity id (null for Stripe rows)';
