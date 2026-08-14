-- Migration 1216: Convert legacy TEAM_MEETING/HUDDLE wall instants to UTC.
-- Migration 1098 intentionally skipped these kinds; rows may still store agency-wall
-- DATETIME instead of UTC. Idempotent via app_timezone_migration_flags.

INSERT INTO app_timezone_migration_flags (flag_key, flag_value)
VALUES ('team_meeting_huddle_stored_utc', 0)
ON DUPLICATE KEY UPDATE flag_key = flag_key;

UPDATE provider_schedule_events pse
LEFT JOIN agencies a ON a.id = pse.agency_id
SET
  pse.start_at = CONVERT_TZ(
    pse.start_at,
    COALESCE(NULLIF(TRIM(pse.event_timezone), ''), NULLIF(TRIM(a.timezone), ''), 'America/Denver'),
    'UTC'
  ),
  pse.end_at = CONVERT_TZ(
    pse.end_at,
    COALESCE(NULLIF(TRIM(pse.event_timezone), ''), NULLIF(TRIM(a.timezone), ''), 'America/Denver'),
    'UTC'
  ),
  pse.event_timezone = COALESCE(
    NULLIF(TRIM(pse.event_timezone), ''),
    NULLIF(TRIM(a.timezone), ''),
    'America/Denver'
  )
WHERE COALESCE((
    SELECT f.flag_value FROM app_timezone_migration_flags f
    WHERE f.flag_key = 'team_meeting_huddle_stored_utc' LIMIT 1
  ), 0) = 0
  AND COALESCE(pse.all_day, 0) = 0
  AND pse.start_at IS NOT NULL
  AND pse.end_at IS NOT NULL
  AND UPPER(COALESCE(pse.kind, '')) IN ('TEAM_MEETING', 'HUDDLE')
  AND NULLIF(TRIM(pse.google_event_id), '') IS NULL
  AND CONVERT_TZ(
    pse.start_at,
    COALESCE(NULLIF(TRIM(pse.event_timezone), ''), NULLIF(TRIM(a.timezone), ''), 'America/Denver'),
    'UTC'
  ) IS NOT NULL;

UPDATE app_timezone_migration_flags
SET flag_value = 1
WHERE flag_key = 'team_meeting_huddle_stored_utc'
  AND flag_value = 0
  AND CONVERT_TZ('2026-01-15 12:00:00', 'America/Denver', 'UTC') IS NOT NULL;
