-- Migration: Add passwordless token purpose
-- Description: Distinguish passwordless tokens used for setup vs password reset

ALTER TABLE users
  ADD COLUMN passwordless_token_purpose ENUM('setup', 'reset') NULL DEFAULT 'setup'
  COMMENT 'Purpose of passwordless_token (setup vs reset)'
  AFTER passwordless_token_expires_at;

