-- Migration 1065: Convert office_events start_at/end_at from building wall time to true UTC.
-- Idempotent via office_locations.events_stored_utc marker.
-- Requires MySQL timezone tables so CONVERT_TZ(named_zone, 'UTC') is non-NULL.
-- If CONVERT_TZ returns NULL, locations stay unmarked — run scripts/migrate-office-events-to-utc.mjs.

ALTER TABLE office_locations
  ADD COLUMN events_stored_utc TINYINT(1) NOT NULL DEFAULT 0
  COMMENT '1 after office_events datetimes were converted from wall local to true UTC';

UPDATE office_events e
INNER JOIN office_locations ol ON ol.id = e.office_location_id
SET
  e.start_at = CONVERT_TZ(e.start_at, COALESCE(NULLIF(TRIM(ol.timezone), ''), 'America/Denver'), 'UTC'),
  e.end_at = CONVERT_TZ(e.end_at, COALESCE(NULLIF(TRIM(ol.timezone), ''), 'America/Denver'), 'UTC')
WHERE ol.events_stored_utc = 0
  AND e.start_at IS NOT NULL
  AND e.end_at IS NOT NULL
  AND CONVERT_TZ(e.start_at, COALESCE(NULLIF(TRIM(ol.timezone), ''), 'America/Denver'), 'UTC') IS NOT NULL
  AND CONVERT_TZ(e.end_at, COALESCE(NULLIF(TRIM(ol.timezone), ''), 'America/Denver'), 'UTC') IS NOT NULL;

UPDATE office_booking_requests br
INNER JOIN office_locations ol ON ol.id = br.office_location_id
SET
  br.start_at = CONVERT_TZ(br.start_at, COALESCE(NULLIF(TRIM(ol.timezone), ''), 'America/Denver'), 'UTC'),
  br.end_at = CONVERT_TZ(br.end_at, COALESCE(NULLIF(TRIM(ol.timezone), ''), 'America/Denver'), 'UTC')
WHERE ol.events_stored_utc = 0
  AND br.start_at IS NOT NULL
  AND br.end_at IS NOT NULL
  AND CONVERT_TZ(br.start_at, COALESCE(NULLIF(TRIM(ol.timezone), ''), 'America/Denver'), 'UTC') IS NOT NULL
  AND CONVERT_TZ(br.end_at, COALESCE(NULLIF(TRIM(ol.timezone), ''), 'America/Denver'), 'UTC') IS NOT NULL;

-- Mark only locations where CONVERT_TZ is available for their zone (avoids false-complete).
UPDATE office_locations ol
SET ol.events_stored_utc = 1
WHERE ol.events_stored_utc = 0
  AND CONVERT_TZ(
    '2026-01-15 12:00:00',
    COALESCE(NULLIF(TRIM(ol.timezone), ''), 'America/Denver'),
    'UTC'
  ) IS NOT NULL;
