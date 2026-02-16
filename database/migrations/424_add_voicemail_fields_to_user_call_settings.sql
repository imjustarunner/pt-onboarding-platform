-- Migration: add voicemail preferences for voice routing fallback

ALTER TABLE user_call_settings
  ADD COLUMN voicemail_enabled BOOLEAN NOT NULL DEFAULT FALSE AFTER allow_call_recording,
  ADD COLUMN voicemail_message TEXT NULL AFTER voicemail_enabled;

