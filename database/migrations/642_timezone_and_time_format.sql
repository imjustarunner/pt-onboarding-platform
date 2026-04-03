-- Add timezone and clock-format preferences to clubs (agencies) and users.
-- Clubs get a canonical IANA timezone + 12h/24h display preference.
-- Users get their own IANA timezone so deadlines are shown in local time.

ALTER TABLE agencies
  ADD COLUMN timezone    VARCHAR(64)        NULL DEFAULT NULL,
  ADD COLUMN time_format ENUM('12h','24h')  NOT NULL DEFAULT '12h';

ALTER TABLE users
  ADD COLUMN timezone VARCHAR(64) NULL DEFAULT NULL;
