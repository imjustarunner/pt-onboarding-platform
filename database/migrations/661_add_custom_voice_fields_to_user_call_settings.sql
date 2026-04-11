-- Migration: Add custom voice and voicemail fields to user_call_settings
-- Description:
-- - Adds fields for out-of-office and vacation voicemail messages.
-- - Adds a vacation mode toggle.
-- - Adds a wait music selection field.

ALTER TABLE user_call_settings
  ADD COLUMN voicemail_ooo_message TEXT DEFAULT NULL AFTER voicemail_message,
  ADD COLUMN voicemail_vacation_message TEXT DEFAULT NULL AFTER voicemail_ooo_message,
  ADD COLUMN vacation_mode_enabled BOOLEAN DEFAULT FALSE AFTER voicemail_enabled,
  ADD COLUMN wait_music_id VARCHAR(100) DEFAULT NULL AFTER allow_call_recording;
