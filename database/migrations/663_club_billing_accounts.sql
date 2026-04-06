-- Billing foundation for Summit Stats clubs.
-- Each club gets exactly one row when created. trial_ends_at = 3 months from creation.
-- Stripe columns are nullable and wired when billing goes live.
-- plan_type progression: trial → free (grace/waived) or paid (active subscription).

CREATE TABLE IF NOT EXISTS club_billing_accounts (
  id                     INT AUTO_INCREMENT PRIMARY KEY,
  club_id                INT NOT NULL,
  plan_type              ENUM('trial','free','paid') NOT NULL DEFAULT 'trial',
  trial_starts_at        DATETIME NOT NULL,
  trial_ends_at          DATETIME NOT NULL,
  paid_starts_at         DATETIME NULL,
  billing_amount_cents   INT NULL,
  billing_interval       ENUM('monthly','annual') NULL,
  stripe_customer_id     VARCHAR(255) NULL,
  stripe_subscription_id VARCHAR(255) NULL,
  notes                  TEXT NULL,
  created_at             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_club_billing (club_id)
);
