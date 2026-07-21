-- Migration 1021: persist Job & Employment Details fields on users
ALTER TABLE users
  ADD COLUMN department VARCHAR(255) NULL DEFAULT NULL
  COMMENT 'Free-text department / team for job details';

ALTER TABLE users
  ADD COLUMN work_location VARCHAR(255) NULL DEFAULT NULL
  COMMENT 'Free-text primary work location for job details';
