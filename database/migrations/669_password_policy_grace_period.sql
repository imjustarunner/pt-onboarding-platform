-- Migration: Password policy grace period for existing users
--
-- Context: The 120-day expiry policy applies to all roles that have access to
-- financial data or payments (i.e. everyone EXCEPT school_staff).
-- school_staff are school-portal-only users with no billing/payments access and
-- are therefore exempt from the credential-rotation requirement entirely.
--
-- For non-exempt users whose password_changed_at is already older than 120 days,
-- this migration grants a 30-day grace window rather than an immediate forced reset:
--
--   password_changed_at is set to exactly 90 days ago
--   → expiry falls 30 days from now  (NOW() - 90d + 120d = NOW() + 30d)
--
-- Users who are NOT yet expired are left untouched (their clock keeps running).
-- Users with no password (pending setup) are also untouched.
-- school_staff are excluded entirely.
--
-- Adjusting the grace window:
--   30-day grace  → interval = 90  DAY  (default below)
--   14-day grace  → interval = 106 DAY
--   60-day grace  → interval = 60  DAY
--   Immediate (no grace, most compliant) → remove the UPDATE entirely.

-- Grace window for already-expired non-exempt users.
UPDATE users
SET    password_changed_at = NOW() - INTERVAL 90 DAY
WHERE  password_hash IS NOT NULL
  AND  role != 'school_staff'
  AND  password_changed_at < NOW() - INTERVAL 120 DAY;

-- Backfill non-exempt users with no password_changed_at at all.
UPDATE users
SET    password_changed_at = NOW() - INTERVAL 90 DAY
WHERE  password_hash IS NOT NULL
  AND  role != 'school_staff'
  AND  password_changed_at IS NULL;
