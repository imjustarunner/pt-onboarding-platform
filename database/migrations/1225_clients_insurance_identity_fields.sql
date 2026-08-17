-- Migration 1225: client insurance charge fields from intake OCR
ALTER TABLE clients
  ADD COLUMN insurance_member_id VARCHAR(128) NULL DEFAULT NULL
  COMMENT 'Primary insurance member ID from intake/OCR',
  ADD COLUMN insurance_group_number VARCHAR(128) NULL DEFAULT NULL
  COMMENT 'Primary insurance group number from intake/OCR',
  ADD COLUMN insurance_subscriber_name VARCHAR(255) NULL DEFAULT NULL
  COMMENT 'Primary insurance subscriber name from intake/OCR',
  ADD COLUMN identity_verified_at DATETIME NULL DEFAULT NULL
  COMMENT 'When lightweight ID name match succeeded during intake',
  ADD COLUMN identity_verification_status VARCHAR(40) NULL DEFAULT NULL
  COMMENT 'verified | submitted | skipped';
