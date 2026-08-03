-- Migration 1112: Per-trigger option to require Communications Center approval before email send
ALTER TABLE agency_notification_trigger_settings
  ADD COLUMN require_approval TINYINT(1) NOT NULL DEFAULT 0
  COMMENT 'When 1, emails for this trigger queue as pending instead of sending immediately';
