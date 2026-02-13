-- Add dark_mode to user_preferences (user can toggle dark theme for the app)
ALTER TABLE user_preferences
  ADD COLUMN dark_mode BOOLEAN DEFAULT FALSE
  COMMENT 'When true, use dark theme for the app'
  AFTER larger_text;
