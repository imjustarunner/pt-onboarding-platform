-- Migration: Add login lockout columns to users table
-- Supports: 10-consecutive-failure lockout for 24 hours (password policy)

ALTER TABLE users
  ADD COLUMN failed_login_attempts INT NOT NULL DEFAULT 0,
  ADD COLUMN locked_until DATETIME NULL DEFAULT NULL;
