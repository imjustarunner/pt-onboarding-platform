-- Migration 1020: optional event details URL + fall check-in post-token category
ALTER TABLE company_events
  ADD COLUMN details_url VARCHAR(1000) NULL DEFAULT NULL
  COMMENT 'Optional public link to event details/flier/webpage';

ALTER TABLE school_event_post_tokens
  MODIFY COLUMN event_category ENUM('back_to_school', 'spring', 'fall_check_in') NOT NULL;
