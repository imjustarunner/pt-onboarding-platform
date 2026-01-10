-- Migration: Add phone_number to users table
-- Description: Store personal cell phone number for user account information

ALTER TABLE users
ADD COLUMN phone_number VARCHAR(20) NULL AFTER email;

