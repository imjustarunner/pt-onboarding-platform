-- Migration 1193: Persist the IANA timezone a schedule event's wall-clock was authored in.
-- Without this, editing a TEAM_MEETING/HUDDLE has to guess the zone from whatever office/tenant
-- happens to be selected in the schedule UI at that moment, which can differ from the zone used
-- at creation and silently shift start_at/end_at on save. Backfill best-effort from agencies.timezone.
ALTER TABLE provider_schedule_events
  ADD COLUMN event_timezone VARCHAR(64) NULL DEFAULT NULL
  COMMENT 'IANA timezone the wall-clock start_at/end_at were entered in (source of truth for re-editing).';

UPDATE provider_schedule_events pse
LEFT JOIN agencies a ON a.id = pse.agency_id
SET pse.event_timezone = COALESCE(NULLIF(TRIM(a.timezone), ''), 'America/Denver')
WHERE pse.event_timezone IS NULL
  AND pse.all_day = 0
  AND pse.start_at IS NOT NULL;
