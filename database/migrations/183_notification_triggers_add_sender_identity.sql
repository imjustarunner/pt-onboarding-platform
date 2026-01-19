-- Migration: Add sender identity selection to notification triggers (platform default + agency override)
-- Description:
-- Adds sender_identity_id to:
--  - notification_triggers (platform default)
--  - agency_notification_trigger_settings (agency override)
--
-- These reference email_sender_identities (created in migration 182).

ALTER TABLE notification_triggers
  ADD COLUMN default_sender_identity_id INT NULL AFTER default_recipients_json,
  ADD CONSTRAINT fk_notification_triggers_default_sender_identity
    FOREIGN KEY (default_sender_identity_id) REFERENCES email_sender_identities(id) ON DELETE SET NULL;

ALTER TABLE agency_notification_trigger_settings
  ADD COLUMN sender_identity_id INT NULL AFTER recipients_json,
  ADD CONSTRAINT fk_agency_trigger_settings_sender_identity
    FOREIGN KEY (sender_identity_id) REFERENCES email_sender_identities(id) ON DELETE SET NULL;

CREATE INDEX idx_agency_trigger_sender_identity ON agency_notification_trigger_settings(sender_identity_id);

