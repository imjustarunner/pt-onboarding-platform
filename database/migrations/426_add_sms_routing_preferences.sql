-- Migration: SMS routing preferences for provider reminders/support handling

ALTER TABLE user_preferences
  ADD COLUMN sms_use_own_number_for_reminders BOOLEAN NOT NULL DEFAULT TRUE AFTER sms_forwarding_enabled,
  ADD COLUMN sms_support_mirror_enabled BOOLEAN NOT NULL DEFAULT FALSE AFTER sms_use_own_number_for_reminders,
  ADD COLUMN sms_support_thread_mode ENUM('respondable','read_only') NOT NULL DEFAULT 'respondable' AFTER sms_support_mirror_enabled;

