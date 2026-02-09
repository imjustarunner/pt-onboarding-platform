-- Migration: Add daily digest preferences to user_preferences
-- Description: Allows users to opt in to a daily digest email and set a time.

ALTER TABLE user_preferences
  ADD COLUMN daily_digest_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN daily_digest_time VARCHAR(5) NULL,
  ADD COLUMN daily_digest_last_sent_at DATETIME NULL;
