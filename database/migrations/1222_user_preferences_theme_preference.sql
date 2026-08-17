-- Migration 1222: theme preference (light, dark, or follow device)
ALTER TABLE user_preferences
  ADD COLUMN theme_preference VARCHAR(16) NULL DEFAULT NULL
  COMMENT 'light, dark, or system (match device color scheme)' AFTER dark_mode;

UPDATE user_preferences
SET theme_preference = CASE WHEN dark_mode = 1 THEN 'dark' ELSE 'light' END
WHERE theme_preference IS NULL;
