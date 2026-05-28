-- Migration 824: Google Calendar sync tracking for program/session staffing assignments

ALTER TABLE company_event_session_providers
  ADD COLUMN google_provider_event_id VARCHAR(128) NULL DEFAULT NULL
    COMMENT 'Google Calendar event id on provider primary calendar'
    AFTER published_by_user_id,
  ADD COLUMN google_provider_calendar_id VARCHAR(255) NULL DEFAULT NULL
    COMMENT 'Provider email used as calendar subject for impersonation'
    AFTER google_provider_event_id,
  ADD COLUMN google_sync_status ENUM('PENDING', 'SYNCED', 'FAILED') NULL DEFAULT NULL
    AFTER google_provider_calendar_id,
  ADD COLUMN google_sync_error TEXT NULL DEFAULT NULL
    AFTER google_sync_status,
  ADD COLUMN google_synced_at DATETIME NULL DEFAULT NULL
    AFTER google_sync_error;

ALTER TABLE skill_builders_event_session_providers
  ADD COLUMN google_provider_event_id VARCHAR(128) NULL DEFAULT NULL
    COMMENT 'Google Calendar event id on provider primary calendar'
    AFTER provider_user_id,
  ADD COLUMN google_provider_calendar_id VARCHAR(255) NULL DEFAULT NULL
    COMMENT 'Provider email used as calendar subject for impersonation'
    AFTER google_provider_event_id,
  ADD COLUMN google_sync_status ENUM('PENDING', 'SYNCED', 'FAILED') NULL DEFAULT NULL
    AFTER google_provider_calendar_id,
  ADD COLUMN google_sync_error TEXT NULL DEFAULT NULL
    AFTER google_sync_status,
  ADD COLUMN google_synced_at DATETIME NULL DEFAULT NULL
    AFTER google_sync_error;

CREATE INDEX idx_cesp_google_sync
  ON company_event_session_providers (google_sync_status, google_synced_at);

CREATE INDEX idx_sb_session_providers_google_sync
  ON skill_builders_event_session_providers (google_sync_status, google_synced_at);
