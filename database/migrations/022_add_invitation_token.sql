-- Migration: Add invitation token and temporary password fields to users table
-- Description: Support user invitation tokens and temporary passwords

ALTER TABLE users
ADD COLUMN invitation_token VARCHAR(255) NULL UNIQUE AFTER phone_number,
ADD COLUMN invitation_token_expires_at TIMESTAMP NULL AFTER invitation_token,
ADD COLUMN temporary_password_hash VARCHAR(255) NULL AFTER invitation_token_expires_at,
ADD COLUMN temporary_password_expires_at TIMESTAMP NULL AFTER temporary_password_hash,
ADD INDEX idx_invitation_token (invitation_token);

