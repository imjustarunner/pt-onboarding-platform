-- Huddle meeting type (provider_plus only) + video recording storage for agency meetings.
-- HUDDLE: similar to TEAM_MEETING but provider_plus-only, host gets 99415, participants get MEETING.

-- Add video recording URL to provider_schedule_event_artifacts (agency meetings only)
ALTER TABLE provider_schedule_event_artifacts
  ADD COLUMN recording_url VARCHAR(2048) NULL AFTER transcript_text,
  ADD COLUMN recording_path VARCHAR(512) NULL AFTER recording_url;

-- HUDDLE uses same provider_schedule_events + provider_schedule_event_attendees structure.
-- No schema change needed - kind='HUDDLE' is sufficient.
-- Twilio room: huddle-{eventId} (handled in webhook/team meetings controller)
