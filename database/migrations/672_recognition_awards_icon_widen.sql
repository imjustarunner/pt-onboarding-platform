-- Migration: Widen the icon column on challenge_recognition_awards
-- Allows storing library icon references like "icon:123" alongside emoji characters.
-- VARCHAR(64) is sufficient for emoji or "icon:<integer>".

ALTER TABLE challenge_recognition_awards
  MODIFY COLUMN icon VARCHAR(64) NULL DEFAULT NULL;
