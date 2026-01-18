-- Add per-user Med Cancel eligibility + rate schedule (default off).

ALTER TABLE users
  ADD COLUMN medcancel_enabled TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN medcancel_rate_schedule VARCHAR(16) NULL;

