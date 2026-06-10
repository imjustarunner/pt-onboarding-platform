-- Migration 860: add public_session_time to company_events for family-facing time display on marketing hub cards
ALTER TABLE company_events
  ADD COLUMN public_session_time VARCHAR(128) NULL DEFAULT NULL
    COMMENT 'Family-facing session time text for public listings (e.g. 9:00 AM – 3:00 PM)';
