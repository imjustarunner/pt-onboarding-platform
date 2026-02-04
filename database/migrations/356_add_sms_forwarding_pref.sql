-- Migration: Add sms_forwarding_enabled to user_preferences

ALTER TABLE user_preferences
  ADD COLUMN sms_forwarding_enabled BOOLEAN DEFAULT TRUE AFTER sms_enabled;
