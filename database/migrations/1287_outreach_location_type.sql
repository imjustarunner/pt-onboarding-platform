-- Migration 1287: Support practices and places of business in Outreach Hub
ALTER TABLE outreach_schools
  ADD COLUMN location_type VARCHAR(32) NOT NULL DEFAULT 'school'
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  COMMENT 'school | practice | business';

CREATE INDEX idx_outreach_location_type ON outreach_schools (agency_id, location_type);
