-- Migration 811: per-tenant notification sender email on agencies
ALTER TABLE agencies
  ADD COLUMN notification_sender_email VARCHAR(255) NULL DEFAULT NULL
    COMMENT 'Default from-address for automated notifications sent on behalf of this tenant';
