-- Migration 1100: Repair office_events (and booking requests) still stored as building wall
-- after locations were marked events_stored_utc=1. Rows that are already true UTC are skipped.
--
-- Heuristic: treating start_at as UTC yields local hour 00:00–05:59, but the stored hour is
-- a typical daytime wall hour (07–19). Those rows were written as wall after migration 1065.
-- Idempotent via app_timezone_migration_flags.office_events_wall_leftovers_repaired.

CREATE TABLE IF NOT EXISTS app_timezone_migration_flags (
  flag_key VARCHAR(64) NOT NULL PRIMARY KEY,
  flag_value TINYINT(1) NOT NULL DEFAULT 0,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO app_timezone_migration_flags (flag_key, flag_value)
VALUES ('office_events_wall_leftovers_repaired', 0)
ON DUPLICATE KEY UPDATE flag_key = flag_key;

UPDATE office_events e
INNER JOIN office_locations ol ON ol.id = e.office_location_id
SET
  e.start_at = CONVERT_TZ(
    e.start_at,
    COALESCE(NULLIF(TRIM(ol.timezone), ''), 'America/Denver'),
    'UTC'
  ),
  e.end_at = CONVERT_TZ(
    e.end_at,
    COALESCE(NULLIF(TRIM(ol.timezone), ''), 'America/Denver'),
    'UTC'
  )
WHERE COALESCE((
    SELECT f.flag_value FROM app_timezone_migration_flags f
    WHERE f.flag_key = 'office_events_wall_leftovers_repaired' LIMIT 1
  ), 0) = 0
  AND e.start_at IS NOT NULL
  AND e.end_at IS NOT NULL
  AND HOUR(e.start_at) BETWEEN 7 AND 19
  AND HOUR(CONVERT_TZ(
    e.start_at,
    'UTC',
    COALESCE(NULLIF(TRIM(ol.timezone), ''), 'America/Denver')
  )) BETWEEN 0 AND 5
  AND CONVERT_TZ(
    e.start_at,
    COALESCE(NULLIF(TRIM(ol.timezone), ''), 'America/Denver'),
    'UTC'
  ) IS NOT NULL
  AND CONVERT_TZ(
    e.end_at,
    COALESCE(NULLIF(TRIM(ol.timezone), ''), 'America/Denver'),
    'UTC'
  ) IS NOT NULL;

UPDATE office_booking_requests br
INNER JOIN office_locations ol ON ol.id = br.office_location_id
SET
  br.start_at = CONVERT_TZ(
    br.start_at,
    COALESCE(NULLIF(TRIM(ol.timezone), ''), 'America/Denver'),
    'UTC'
  ),
  br.end_at = CONVERT_TZ(
    br.end_at,
    COALESCE(NULLIF(TRIM(ol.timezone), ''), 'America/Denver'),
    'UTC'
  )
WHERE COALESCE((
    SELECT f.flag_value FROM app_timezone_migration_flags f
    WHERE f.flag_key = 'office_events_wall_leftovers_repaired' LIMIT 1
  ), 0) = 0
  AND br.start_at IS NOT NULL
  AND br.end_at IS NOT NULL
  AND HOUR(br.start_at) BETWEEN 7 AND 19
  AND HOUR(CONVERT_TZ(
    br.start_at,
    'UTC',
    COALESCE(NULLIF(TRIM(ol.timezone), ''), 'America/Denver')
  )) BETWEEN 0 AND 5
  AND CONVERT_TZ(
    br.start_at,
    COALESCE(NULLIF(TRIM(ol.timezone), ''), 'America/Denver'),
    'UTC'
  ) IS NOT NULL
  AND CONVERT_TZ(
    br.end_at,
    COALESCE(NULLIF(TRIM(ol.timezone), ''), 'America/Denver'),
    'UTC'
  ) IS NOT NULL;

UPDATE app_timezone_migration_flags
SET flag_value = 1
WHERE flag_key = 'office_events_wall_leftovers_repaired'
  AND flag_value = 0
  AND CONVERT_TZ('2026-01-15 12:00:00', 'America/Denver', 'UTC') IS NOT NULL;
