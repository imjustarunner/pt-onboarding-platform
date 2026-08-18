-- Migration 1241: Track who last edited an outreach trip

ALTER TABLE outreach_trips
  ADD COLUMN updated_by_user_id INT NULL DEFAULT NULL
    COMMENT 'User who last edited trip metadata or route';
