-- Persist explicit transcription opt-in separately from attendance tracking.
-- NULL preserves the general-meeting opt-in default; no historical backfill.
ALTER TABLE provider_schedule_event_artifacts ADD COLUMN transcript_started_at DATETIME NULL;
