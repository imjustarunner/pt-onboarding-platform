-- User preference: play sound when new in-app notification arrives

ALTER TABLE user_preferences
  ADD COLUMN notification_sound_enabled BOOLEAN DEFAULT TRUE
  COMMENT 'Play sound when new notification arrives in browser' AFTER push_notifications_enabled;
