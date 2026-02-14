-- Migration: Add kiosk_pin_hash to user_preferences
-- Description: Optional 4-digit PIN for staff to identify at kiosk (clock in/out)

ALTER TABLE user_preferences
  ADD COLUMN kiosk_pin_hash VARCHAR(64) NULL COMMENT 'SHA256 hash of 4-digit PIN for kiosk identification';
