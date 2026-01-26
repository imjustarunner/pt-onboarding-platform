-- Add optional external busy calendar (ICS) URL per user.
-- Used for schedule auditing overlays (busy blocks only).

ALTER TABLE users
  ADD COLUMN external_busy_ics_url VARCHAR(1024) NULL;

