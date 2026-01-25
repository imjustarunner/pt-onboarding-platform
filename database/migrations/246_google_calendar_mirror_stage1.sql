-- Migration: Stage 1 Google Calendar mirroring fields
-- Purpose:
-- - Store Workspace room resource email for each office (room)
-- - Store google event linkage + sync status on booked occurrences

ALTER TABLE office_rooms
  ADD COLUMN google_resource_email VARCHAR(255) NULL AFTER svg_room_id;

ALTER TABLE office_events
  ADD COLUMN google_provider_event_id VARCHAR(128) NULL AFTER updated_at,
  ADD COLUMN google_provider_calendar_id VARCHAR(255) NULL AFTER google_provider_event_id,
  ADD COLUMN google_room_resource_email VARCHAR(255) NULL AFTER google_provider_calendar_id,
  ADD COLUMN google_sync_status ENUM('PENDING','SYNCED','FAILED') NULL AFTER google_room_resource_email,
  ADD COLUMN google_sync_error TEXT NULL AFTER google_sync_status,
  ADD COLUMN google_synced_at DATETIME NULL AFTER google_sync_error;

CREATE INDEX idx_office_events_google_sync
  ON office_events (slot_state, google_sync_status, google_synced_at);

