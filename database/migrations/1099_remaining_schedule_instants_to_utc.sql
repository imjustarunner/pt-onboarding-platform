-- Migration 1099: Convert appointments, discovery booked times, planned outs,
-- and appointment reminders to UTC DATETIME.
-- Idempotent via app_timezone_migration_flags.remaining_schedule_instants_stored_utc.
-- If CONVERT_TZ is NULL, run scripts/migrate-remaining-schedule-instants-to-utc.mjs.

CREATE TABLE IF NOT EXISTS app_timezone_migration_flags (
  flag_key VARCHAR(64) NOT NULL PRIMARY KEY,
  flag_value TINYINT(1) NOT NULL DEFAULT 0,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO app_timezone_migration_flags (flag_key, flag_value)
VALUES ('remaining_schedule_instants_stored_utc', 0)
ON DUPLICATE KEY UPDATE flag_key = flag_key;

UPDATE appointments ap
LEFT JOIN agencies a ON a.id = ap.agency_id
SET
  ap.start_at = CONVERT_TZ(ap.start_at, COALESCE(NULLIF(TRIM(a.timezone), ''), 'America/Denver'), 'UTC'),
  ap.end_at = CONVERT_TZ(ap.end_at, COALESCE(NULLIF(TRIM(a.timezone), ''), 'America/Denver'), 'UTC')
WHERE COALESCE((
    SELECT f.flag_value FROM app_timezone_migration_flags f
    WHERE f.flag_key = 'remaining_schedule_instants_stored_utc' LIMIT 1
  ), 0) = 0
  AND ap.start_at IS NOT NULL
  AND CONVERT_TZ(ap.start_at, COALESCE(NULLIF(TRIM(a.timezone), ''), 'America/Denver'), 'UTC') IS NOT NULL;

UPDATE discovery_sessions ds
LEFT JOIN agencies a ON a.id = ds.agency_id
SET
  ds.booked_start_at = CASE
    WHEN ds.booked_start_at IS NULL THEN NULL
    ELSE CONVERT_TZ(ds.booked_start_at, COALESCE(NULLIF(TRIM(a.timezone), ''), 'America/Denver'), 'UTC')
  END,
  ds.booked_end_at = CASE
    WHEN ds.booked_end_at IS NULL THEN NULL
    ELSE CONVERT_TZ(ds.booked_end_at, COALESCE(NULLIF(TRIM(a.timezone), ''), 'America/Denver'), 'UTC')
  END
WHERE COALESCE((
    SELECT f.flag_value FROM app_timezone_migration_flags f
    WHERE f.flag_key = 'remaining_schedule_instants_stored_utc' LIMIT 1
  ), 0) = 0
  AND (
    (ds.booked_start_at IS NOT NULL AND CONVERT_TZ(ds.booked_start_at, COALESCE(NULLIF(TRIM(a.timezone), ''), 'America/Denver'), 'UTC') IS NOT NULL)
    OR ds.booked_start_at IS NULL
  );

UPDATE planned_outs po
LEFT JOIN agencies a ON a.id = po.agency_id
SET
  po.start_at = CASE
    WHEN po.start_at IS NULL THEN NULL
    ELSE CONVERT_TZ(po.start_at, COALESCE(NULLIF(TRIM(a.timezone), ''), 'America/Denver'), 'UTC')
  END,
  po.end_at = CASE
    WHEN po.end_at IS NULL THEN NULL
    ELSE CONVERT_TZ(po.end_at, COALESCE(NULLIF(TRIM(a.timezone), ''), 'America/Denver'), 'UTC')
  END
WHERE COALESCE((
    SELECT f.flag_value FROM app_timezone_migration_flags f
    WHERE f.flag_key = 'remaining_schedule_instants_stored_utc' LIMIT 1
  ), 0) = 0
  AND (
    (po.start_at IS NOT NULL AND CONVERT_TZ(po.start_at, COALESCE(NULLIF(TRIM(a.timezone), ''), 'America/Denver'), 'UTC') IS NOT NULL)
    OR po.start_at IS NULL
  );

-- Reminder schedule times: treat existing digits as wall in agency TZ → UTC
UPDATE appointment_reminders ar
LEFT JOIN agencies a ON a.id = ar.agency_id
SET ar.scheduled_for = CONVERT_TZ(
  ar.scheduled_for,
  COALESCE(NULLIF(TRIM(a.timezone), ''), 'America/Denver'),
  'UTC'
)
WHERE COALESCE((
    SELECT f.flag_value FROM app_timezone_migration_flags f
    WHERE f.flag_key = 'remaining_schedule_instants_stored_utc' LIMIT 1
  ), 0) = 0
  AND ar.scheduled_for IS NOT NULL
  AND CONVERT_TZ(ar.scheduled_for, COALESCE(NULLIF(TRIM(a.timezone), ''), 'America/Denver'), 'UTC') IS NOT NULL;

UPDATE app_timezone_migration_flags
SET flag_value = 1
WHERE flag_key = 'remaining_schedule_instants_stored_utc'
  AND flag_value = 0
  AND CONVERT_TZ('2026-01-15 12:00:00', 'America/Denver', 'UTC') IS NOT NULL;
