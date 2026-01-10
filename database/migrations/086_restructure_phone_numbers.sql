-- Migration: Restructure phone numbers
-- Description: Add separate fields for personal_phone, work_phone, and work_phone_extension
-- Migrate existing phone_number data to personal_phone

-- Add new phone number columns
ALTER TABLE users
ADD COLUMN personal_phone VARCHAR(20) NULL COMMENT 'Personal phone number' AFTER phone_number,
ADD COLUMN work_phone VARCHAR(20) NULL COMMENT 'Work phone number' AFTER personal_phone,
ADD COLUMN work_phone_extension VARCHAR(10) NULL COMMENT 'Work phone extension' AFTER work_phone;

-- Migrate existing phone_number data to personal_phone
UPDATE users
SET personal_phone = phone_number
WHERE phone_number IS NOT NULL AND personal_phone IS NULL;

-- Add indexes for efficient queries
CREATE INDEX idx_personal_phone ON users(personal_phone);
CREATE INDEX idx_work_phone ON users(work_phone);
