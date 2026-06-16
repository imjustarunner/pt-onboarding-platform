-- Migration 863: deduplicate office schedule data and enforce the integrity guards
-- from migration 862 that could not be applied due to pre-existing duplicate rows.
--
-- Step 1  Cancel duplicate active office_events, keeping one canonical row per slot.
--         Preference: keep the row with status = 'BOOKED'; otherwise keep the oldest id.
--
-- Step 2  Deactivate duplicate active office_standing_assignments, keeping the oldest id
--         per (office_location_id, room_id, weekday, hour).
--         Future office_events linked to deactivated assignments are also cancelled.
--
-- Step 3  Add the unique indexes from migration 862 that may have been skipped due to
--         duplicates.  The migration runner treats ER_DUP_KEYNAME as ignorable so this
--         is idempotent: if 862 already applied an index it is silently skipped here.
--
-- After this migration the database enforces at the schema level that two non-cancelled
-- events cannot occupy the same room+time, and two active standing assignments cannot
-- own the same office+room+weekday+hour.

-- ── Step 1: deduplicate office_events ────────────────────────────────────────

UPDATE office_events e
JOIN (
  SELECT
    room_id,
    start_at,
    end_at,
    COALESCE(
      MIN(CASE WHEN UPPER(COALESCE(status, '')) = 'BOOKED' THEN id ELSE NULL END),
      MIN(id)
    ) AS keep_id
  FROM office_events
  WHERE status IS NULL OR UPPER(status) <> 'CANCELLED'
  GROUP BY room_id, start_at, end_at
  HAVING COUNT(*) > 1
) grp
  ON  e.room_id  = grp.room_id
  AND e.start_at = grp.start_at
  AND e.end_at   = grp.end_at
  AND e.id      != grp.keep_id
SET e.status = 'CANCELLED', e.updated_at = NOW()
WHERE e.status IS NULL OR UPPER(e.status) <> 'CANCELLED';

-- ── Step 2: deduplicate office_standing_assignments ───────────────────────────

UPDATE office_standing_assignments sa
JOIN (
  SELECT
    office_location_id,
    room_id,
    weekday,
    hour,
    MIN(id) AS keep_id
  FROM office_standing_assignments
  WHERE is_active = TRUE
  GROUP BY office_location_id, room_id, weekday, hour
  HAVING COUNT(*) > 1
) grp
  ON  sa.office_location_id = grp.office_location_id
  AND sa.room_id             = grp.room_id
  AND sa.weekday             = grp.weekday
  AND sa.hour                = grp.hour
  AND sa.id                 != grp.keep_id
SET sa.is_active = FALSE, sa.updated_at = NOW()
WHERE sa.is_active = TRUE;

UPDATE office_events oe
JOIN  office_standing_assignments osa ON osa.id = oe.standing_assignment_id
SET   oe.status = 'CANCELLED', oe.updated_at = NOW()
WHERE osa.is_active = FALSE
  AND oe.start_at  >= NOW()
  AND (oe.status IS NULL OR UPPER(oe.status) <> 'CANCELLED');

-- ── Step 3: enforce unique indexes (idempotent via ER_DUP_KEYNAME skip) ──────

ALTER TABLE office_events
  ADD UNIQUE KEY uniq_office_events_active_room_slot (
    active_guard_room_id,
    active_guard_start_at,
    active_guard_end_at
  );

ALTER TABLE office_standing_assignments
  ADD UNIQUE KEY uniq_office_standing_assignments_active_slot (
    active_guard_office_location_id,
    active_guard_room_id,
    active_guard_weekday,
    active_guard_hour
  );

ALTER TABLE office_booking_plans
  ADD UNIQUE KEY uniq_office_booking_plans_one_active (
    active_guard_standing_assignment_id
  );
