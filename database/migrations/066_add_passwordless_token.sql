-- Migration: Add passwordless login token fields to users table
-- Description: Add fields for passwordless login tokens that auto-login users

ALTER TABLE users
ADD COLUMN passwordless_token VARCHAR(255) NULL COMMENT 'Token for passwordless login',
ADD COLUMN passwordless_token_expires_at TIMESTAMP NULL COMMENT 'Expiration time for passwordless token (48 hours)';

-- Add indexes for efficient token lookups
CREATE INDEX idx_passwordless_token ON users(passwordless_token);
CREATE INDEX idx_passwordless_token_expires ON users(passwordless_token_expires_at);
