-- Migration 1383: optional secondary email on agency contacts (unknown-sender resolve)
ALTER TABLE agency_contacts
  ADD COLUMN email_alt VARCHAR(255) NULL DEFAULT NULL
  COMMENT 'Additional email for the same contact (e.g. resolved from unknown sender)'
  AFTER email;
