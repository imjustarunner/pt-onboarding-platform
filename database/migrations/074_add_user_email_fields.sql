-- Migration: Add work email and personal email fields to users
-- Description: Add separate email fields for work (username) and personal (communications)

ALTER TABLE users
ADD COLUMN work_email VARCHAR(255) NULL COMMENT 'Work email used as username for active users' AFTER email,
ADD COLUMN personal_email VARCHAR(255) NULL COMMENT 'Personal email for communications, not used for login' AFTER work_email;

-- Add indexes for efficient lookups
CREATE INDEX idx_work_email ON users(work_email);
CREATE INDEX idx_personal_email ON users(personal_email);
