-- Migration: Add system_phone_number to users
-- Description: Twilio masked messaging uses a system number per user (from Twilio pool).

ALTER TABLE users
ADD COLUMN system_phone_number VARCHAR(20) NULL COMMENT 'Twilio system number (E.164) used for masked client SMS' AFTER work_phone_extension;

CREATE INDEX idx_system_phone_number ON users(system_phone_number);

