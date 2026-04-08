-- Migration 688: Add details/notes field to recognition awards and allow 'challenge' period type
-- details: free-text notes used by managers and future AI generation (title + type + details → workout/challenge gen)

ALTER TABLE challenge_recognition_awards
  ADD COLUMN details TEXT NULL DEFAULT NULL AFTER group_filter;
