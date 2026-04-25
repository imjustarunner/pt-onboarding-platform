-- Migration 810: SSTC notification preferences JSON on user_preferences
ALTER TABLE user_preferences
  ADD COLUMN sstc_notification_prefs_json JSON NULL DEFAULT NULL
    COMMENT 'SSTC-specific notification prefs: loginSplash, dailySummary, weeklySummary';
