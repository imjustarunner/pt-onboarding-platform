-- Migration 839: link release record to consenting guardian user
ALTER TABLE company_event_releases
  ADD COLUMN consenting_guardian_user_id INT NULL DEFAULT NULL
  COMMENT 'User ID of guardian who consented to pickup photos for this client';
