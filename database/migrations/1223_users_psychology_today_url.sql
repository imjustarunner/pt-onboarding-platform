-- Migration 1223: public Psychology Today profile URL on the user record
ALTER TABLE users
  ADD COLUMN psychology_today_url VARCHAR(700) NULL DEFAULT NULL
  COMMENT 'Public Psychology Today profile URL shown on school portal bios when set';
