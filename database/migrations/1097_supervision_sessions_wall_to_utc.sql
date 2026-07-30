-- Migration 1097: Convert supervision_sessions DATETIME instants from agency wall → UTC.
-- Idempotent via agencies.supervision_times_stored_utc.
-- Requires MySQL timezone tables so CONVERT_TZ(named_zone, 'UTC') is non-NULL.
-- If CONVERT_TZ returns NULL, agencies stay unmarked — run scripts/migrate-supervision-sessions-to-utc.mjs.

ALTER TABLE agencies
  ADD COLUMN supervision_times_stored_utc TINYINT(1) NOT NULL DEFAULT 0
  COMMENT '1 after supervision_sessions datetimes were converted from wall local to true UTC';

UPDATE supervision_sessions ss
JOIN agencies a ON a.id = ss.agency_id
SET
  ss.start_at = CONVERT_TZ(ss.start_at, COALESCE(NULLIF(TRIM(a.timezone), ''), 'America/Denver'), 'UTC'),
  ss.end_at = CONVERT_TZ(ss.end_at, COALESCE(NULLIF(TRIM(a.timezone), ''), 'America/Denver'), 'UTC'),
  ss.signup_closes_at = CASE
    WHEN ss.signup_closes_at IS NULL THEN NULL
    ELSE CONVERT_TZ(ss.signup_closes_at, COALESCE(NULLIF(TRIM(a.timezone), ''), 'America/Denver'), 'UTC')
  END
WHERE COALESCE(a.supervision_times_stored_utc, 0) = 0
  AND CONVERT_TZ(ss.start_at, COALESCE(NULLIF(TRIM(a.timezone), ''), 'America/Denver'), 'UTC') IS NOT NULL
  AND CONVERT_TZ(ss.end_at, COALESCE(NULLIF(TRIM(a.timezone), ''), 'America/Denver'), 'UTC') IS NOT NULL;

-- Mark only agencies where CONVERT_TZ works for their zone (avoids false-complete).
UPDATE agencies a
SET a.supervision_times_stored_utc = 1
WHERE COALESCE(a.supervision_times_stored_utc, 0) = 0
  AND CONVERT_TZ(
    '2026-01-15 12:00:00',
    COALESCE(NULLIF(TRIM(a.timezone), ''), 'America/Denver'),
    'UTC'
  ) IS NOT NULL;
