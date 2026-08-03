-- Migration 1111: Optional per-agency subject override for notification trigger emails
ALTER TABLE agency_notification_trigger_settings
  ADD COLUMN subject_override VARCHAR(255) NULL DEFAULT NULL
  COMMENT 'When set, overrides the subject line for emails sent via this trigger';
