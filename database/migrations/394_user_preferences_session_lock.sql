-- Session lock: user preferences for lock screen instead of logout
-- Only for users with My Dashboard. 4-digit PIN, agency branding on lock screen.
ALTER TABLE user_preferences
  ADD COLUMN session_lock_enabled BOOLEAN DEFAULT FALSE AFTER helper_enabled,
  ADD COLUMN inactivity_timeout_minutes INT NULL COMMENT 'User preference; capped by agency/platform max' AFTER session_lock_enabled,
  ADD COLUMN session_lock_pin_hash VARCHAR(255) NULL COMMENT 'Bcrypt hash of 4-digit PIN' AFTER inactivity_timeout_minutes;
