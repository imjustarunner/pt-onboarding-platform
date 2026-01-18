-- Migration: Notification trigger registry (platform-level) + per-agency overrides + dedupe events
-- Description: Allows admins to toggle triggers on/off, configure recipients/channels per agency, and prevent notification spam.

CREATE TABLE IF NOT EXISTS notification_triggers (
  trigger_key VARCHAR(128) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT NULL,
  default_enabled TINYINT(1) NOT NULL DEFAULT 1,
  default_channels_json JSON NULL,
  default_recipients_json JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (trigger_key)
);

CREATE TABLE IF NOT EXISTS agency_notification_trigger_settings (
  id INT NOT NULL AUTO_INCREMENT,
  agency_id INT NOT NULL,
  trigger_key VARCHAR(128) NOT NULL,
  enabled TINYINT(1) NULL,
  channels_json JSON NULL,
  recipients_json JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_agency_trigger (agency_id, trigger_key),
  CONSTRAINT fk_agency_trigger_settings_agency_id FOREIGN KEY (agency_id) REFERENCES agencies (id) ON DELETE CASCADE,
  CONSTRAINT fk_agency_trigger_settings_trigger_key FOREIGN KEY (trigger_key) REFERENCES notification_triggers (trigger_key) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS notification_events (
  id INT NOT NULL AUTO_INCREMENT,
  agency_id INT NOT NULL,
  trigger_key VARCHAR(128) NOT NULL,
  payroll_period_id INT NULL,
  provider_user_id INT NULL,
  stale_period_id INT NULL,
  recipient_user_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_notification_event_dedupe (agency_id, trigger_key, payroll_period_id, provider_user_id, stale_period_id, recipient_user_id),
  INDEX idx_notification_events_agency_trigger (agency_id, trigger_key),
  INDEX idx_notification_events_created_at (created_at),
  CONSTRAINT fk_notification_events_agency_id FOREIGN KEY (agency_id) REFERENCES agencies (id) ON DELETE CASCADE,
  CONSTRAINT fk_notification_events_trigger_key FOREIGN KEY (trigger_key) REFERENCES notification_triggers (trigger_key) ON DELETE CASCADE,
  CONSTRAINT fk_notification_events_payroll_period_id FOREIGN KEY (payroll_period_id) REFERENCES payroll_periods (id) ON DELETE SET NULL,
  CONSTRAINT fk_notification_events_provider_user_id FOREIGN KEY (provider_user_id) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_notification_events_stale_period_id FOREIGN KEY (stale_period_id) REFERENCES payroll_periods (id) ON DELETE SET NULL,
  CONSTRAINT fk_notification_events_recipient_user_id FOREIGN KEY (recipient_user_id) REFERENCES users (id) ON DELETE SET NULL
);

-- Seed default triggers (default ON)
INSERT INTO notification_triggers
  (trigger_key, name, description, default_enabled, default_channels_json, default_recipients_json)
VALUES
  (
    'payroll_unpaid_notes_2_periods_old',
    'Unpaid notes 2 pay periods old',
    'Alerts when a provider has unpaid note units (No Note or Draft) in the pay period that is two periods prior to the current posted payroll.',
    1,
    JSON_OBJECT('inApp', TRUE, 'sms', FALSE, 'email', FALSE),
    JSON_OBJECT('provider', TRUE, 'supervisor', TRUE, 'clinicalPracticeAssistant', TRUE, 'admin', TRUE)
  )
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  description = VALUES(description),
  default_enabled = VALUES(default_enabled),
  default_channels_json = VALUES(default_channels_json),
  default_recipients_json = VALUES(default_recipients_json);

