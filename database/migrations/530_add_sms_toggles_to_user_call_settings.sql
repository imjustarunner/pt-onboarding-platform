-- Migration: Add SMS inbound/outbound toggles to user_call_settings
-- Same number is used for both calling and texting; these control texting only.

ALTER TABLE user_call_settings
  ADD COLUMN sms_inbound_enabled BOOLEAN NOT NULL DEFAULT TRUE AFTER voicemail_message,
  ADD COLUMN sms_outbound_enabled BOOLEAN NOT NULL DEFAULT TRUE AFTER sms_inbound_enabled;
