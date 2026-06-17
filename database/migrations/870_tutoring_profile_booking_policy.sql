-- Migration 870: add booking policy columns to provider_tutoring_profiles
ALTER TABLE provider_tutoring_profiles
  ADD COLUMN min_session_package TINYINT UNSIGNED NOT NULL DEFAULT 1
    COMMENT 'Minimum sessions guardian must book at once: 1 = single OK, 2/3/4 = package required',
  ADD COLUMN payment_policy ENUM('PREPAY','POST_SESSION') NOT NULL DEFAULT 'POST_SESSION'
    COMMENT 'PREPAY = guardian pays at booking time via Stripe; POST_SESSION = card charged after each completed session';
