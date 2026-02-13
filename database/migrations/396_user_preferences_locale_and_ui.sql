-- User preferences: timezone, schedule view, layout density, date/time format, push notifications
-- Supports international users and personalization.

ALTER TABLE user_preferences
  ADD COLUMN timezone VARCHAR(64) NULL COMMENT 'IANA timezone e.g. America/New_York' AFTER dark_mode,
  ADD COLUMN schedule_default_view VARCHAR(32) DEFAULT 'open_finder' COMMENT 'open_finder | office_layout' AFTER timezone,
  ADD COLUMN layout_density VARCHAR(32) DEFAULT 'standard' COMMENT 'compact | standard | comfortable' AFTER schedule_default_view,
  ADD COLUMN date_format VARCHAR(16) DEFAULT 'MM/DD' COMMENT 'MM/DD | DD/MM | YYYY-MM-DD' AFTER layout_density,
  ADD COLUMN time_format VARCHAR(8) DEFAULT '12h' COMMENT '12h | 24h' AFTER date_format,
  ADD COLUMN push_notifications_enabled BOOLEAN DEFAULT FALSE COMMENT 'Browser push notifications' AFTER time_format;
