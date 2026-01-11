-- Migration: Add username field to users table
-- Description: Add separate username field that can be updated independently from email
-- Username starts as personal_email, can be changed to corporate email by admin

ALTER TABLE users
ADD COLUMN username VARCHAR(255) NULL COMMENT 'Username for login, initially set to personal_email, can be changed to corporate email' AFTER personal_email;

-- Set initial username value to personal_email for existing users
UPDATE users
SET username = personal_email
WHERE personal_email IS NOT NULL AND username IS NULL;

-- For users without personal_email, set username to email
UPDATE users
SET username = email
WHERE username IS NULL AND email IS NOT NULL;

-- Add unique index on username (allows NULL values)
CREATE UNIQUE INDEX idx_username ON users(username);

-- Add index for efficient lookups
CREATE INDEX idx_username_lookup ON users(username);
