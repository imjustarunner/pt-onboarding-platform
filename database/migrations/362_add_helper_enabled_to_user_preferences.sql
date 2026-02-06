-- Migration: Add helper_enabled preference to user_preferences
-- Description: Allows users to toggle the helper widget on/off

ALTER TABLE user_preferences
  ADD COLUMN helper_enabled BOOLEAN NOT NULL DEFAULT TRUE;
