-- Migration: Track password change time to enforce 6-month expiration

ALTER TABLE users
  ADD COLUMN password_changed_at DATETIME NULL AFTER password_hash;

-- Backfill for existing users with a password set
UPDATE users
SET password_changed_at = created_at
WHERE password_hash IS NOT NULL
  AND password_changed_at IS NULL;

