-- Per-type toast notification preferences (login/logout, new packets)
-- JSON column stores: { login_logout: { toast_enabled, duration_seconds, sound_enabled }, new_packet: { toast_enabled, duration_seconds, sound_enabled } }
-- duration_seconds: null = dismissable (persists until dismissed), number = auto-dismiss after N seconds

ALTER TABLE user_preferences
  ADD COLUMN toast_preferences JSON DEFAULT NULL
  COMMENT 'Per-type toast notification settings (toast on/off, duration, sound)' AFTER notification_sound_enabled;
