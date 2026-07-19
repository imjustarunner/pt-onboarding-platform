-- Migration 988: Opaque join tokens for supervision + team meeting video links
-- Prevents guessing sequential numeric IDs in /join/... URLs.

ALTER TABLE supervision_sessions
  ADD COLUMN join_token VARCHAR(64) NULL DEFAULT NULL
  COMMENT 'Opaque public join token (unguessable; preferred over numeric id in URLs)'
  AFTER id;

ALTER TABLE supervision_sessions
  ADD UNIQUE KEY uq_supervision_sessions_join_token (join_token);

ALTER TABLE provider_schedule_events
  ADD COLUMN join_token VARCHAR(64) NULL DEFAULT NULL
  COMMENT 'Opaque public join token for TEAM_MEETING/HUDDLE platform video'
  AFTER id;

ALTER TABLE provider_schedule_events
  ADD UNIQUE KEY uq_provider_schedule_events_join_token (join_token);

-- Backfill existing rows so current join links are opaque (not sequential ids).
UPDATE supervision_sessions
SET join_token = REPLACE(UUID(), '-', '')
WHERE join_token IS NULL OR join_token = '';

UPDATE provider_schedule_events
SET join_token = REPLACE(UUID(), '-', '')
WHERE (join_token IS NULL OR join_token = '')
  AND UPPER(COALESCE(kind, '')) IN ('TEAM_MEETING', 'HUDDLE');
