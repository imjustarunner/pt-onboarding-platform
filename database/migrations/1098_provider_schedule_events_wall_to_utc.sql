-- Migration 1098: Convert remaining provider_schedule_events + fall check-in DATETIMEs to UTC.
-- Skips TEAM_MEETING/HUDDLE and Google-synced non-fall-checkin rows (already UTC).
-- Idempotent via app_timezone_migration_flags.schedule_events_stored_utc.
-- If CONVERT_TZ is NULL, flag stays 0 — run scripts/migrate-provider-schedule-events-to-utc.mjs.

CREATE TABLE IF NOT EXISTS app_timezone_migration_flags (
  flag_key VARCHAR(64) NOT NULL PRIMARY KEY,
  flag_value TINYINT(1) NOT NULL DEFAULT 0,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO app_timezone_migration_flags (flag_key, flag_value)
VALUES ('schedule_events_stored_utc', 0)
ON DUPLICATE KEY UPDATE flag_key = flag_key;

-- Convert wall PSE rows that are not already UTC.
UPDATE provider_schedule_events pse
LEFT JOIN agencies a ON a.id = pse.agency_id
SET
  pse.start_at = CONVERT_TZ(
    pse.start_at,
    COALESCE(NULLIF(TRIM(a.timezone), ''), 'America/Denver'),
    'UTC'
  ),
  pse.end_at = CONVERT_TZ(
    pse.end_at,
    COALESCE(NULLIF(TRIM(a.timezone), ''), 'America/Denver'),
    'UTC'
  )
WHERE COALESCE((
    SELECT f.flag_value FROM app_timezone_migration_flags f
    WHERE f.flag_key = 'schedule_events_stored_utc' LIMIT 1
  ), 0) = 0
  AND COALESCE(pse.all_day, 0) = 0
  AND pse.start_at IS NOT NULL
  AND pse.end_at IS NOT NULL
  AND NOT (
    UPPER(COALESCE(pse.kind, '')) IN ('TEAM_MEETING', 'HUDDLE')
    OR (
      NULLIF(TRIM(pse.google_event_id), '') IS NOT NULL
      AND UPPER(COALESCE(pse.kind, '')) NOT IN ('FALL_CHECKIN_PRESLOT', 'FALL_CHECKIN_BOOKED')
    )
  )
  AND CONVERT_TZ(
    pse.start_at,
    COALESCE(NULLIF(TRIM(a.timezone), ''), 'America/Denver'),
    'UTC'
  ) IS NOT NULL;

-- Fall check-in slots
UPDATE school_reinit_checkin_slots s
LEFT JOIN agencies a ON a.id = s.agency_id
SET
  s.starts_at = CONVERT_TZ(s.starts_at, COALESCE(NULLIF(TRIM(a.timezone), ''), 'America/Denver'), 'UTC'),
  s.ends_at = CONVERT_TZ(s.ends_at, COALESCE(NULLIF(TRIM(a.timezone), ''), 'America/Denver'), 'UTC')
WHERE COALESCE((
    SELECT f.flag_value FROM app_timezone_migration_flags f
    WHERE f.flag_key = 'schedule_events_stored_utc' LIMIT 1
  ), 0) = 0
  AND s.starts_at IS NOT NULL
  AND CONVERT_TZ(s.starts_at, COALESCE(NULLIF(TRIM(a.timezone), ''), 'America/Denver'), 'UTC') IS NOT NULL;

-- Fall check-in bookings
UPDATE school_reinit_checkin_bookings b
LEFT JOIN agencies a ON a.id = b.agency_id
SET
  b.starts_at = CONVERT_TZ(b.starts_at, COALESCE(NULLIF(TRIM(a.timezone), ''), 'America/Denver'), 'UTC'),
  b.ends_at = CONVERT_TZ(b.ends_at, COALESCE(NULLIF(TRIM(a.timezone), ''), 'America/Denver'), 'UTC')
WHERE COALESCE((
    SELECT f.flag_value FROM app_timezone_migration_flags f
    WHERE f.flag_key = 'schedule_events_stored_utc' LIMIT 1
  ), 0) = 0
  AND b.starts_at IS NOT NULL
  AND CONVERT_TZ(b.starts_at, COALESCE(NULLIF(TRIM(a.timezone), ''), 'America/Denver'), 'UTC') IS NOT NULL;

-- Mark complete only when CONVERT_TZ works for Denver (proxy for TZ tables loaded).
UPDATE app_timezone_migration_flags
SET flag_value = 1
WHERE flag_key = 'schedule_events_stored_utc'
  AND flag_value = 0
  AND CONVERT_TZ('2026-01-15 12:00:00', 'America/Denver', 'UTC') IS NOT NULL;
