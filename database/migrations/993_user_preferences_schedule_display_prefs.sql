-- Migration 993: persist schedule display choices (row height, day/week/agenda, etc.)
ALTER TABLE user_preferences
  ADD COLUMN schedule_display_prefs JSON NULL
  COMMENT 'My Schedule UI prefs: rowHeightMode, spanMode, weekStartsOn, hideWeekend, showAllHours';
