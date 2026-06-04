-- Migration 847: Restore booking plans and future slots for assignments whose plans
-- were deactivated by downgradeBookedWithoutExternalOverlap but whose events were
-- subsequently re-materialized as ASSIGNED_AVAILABLE (status = NULL) rather than
-- RELEASED after migration 696 reinstated the standing assignments.
--
-- WHY 846 MISSED THESE:
--   Migration 846 filtered on oe.status = 'RELEASED'.  However, after migration 696
--   reinstated the standing assignments (is_active = TRUE), the materializer rebuilt
--   future occurrences fresh as ASSIGNED_AVAILABLE with status = NULL.  Those events
--   were invisible to 846's filter even though their assignment still had no active
--   booking plan.
--
-- WHAT THIS DOES:
--   Step A — Re-activate the most recently deactivated booking plan for every
--             active assignment that currently has no live plan, looking back 90 days.
--             Skips assignments where any future slot is already occupied by a
--             different provider (conflict guard).
--   Step B — Set future ASSIGNED_AVAILABLE events (status NULL or RELEASED,
--             booking_plan_id NULL) to ASSIGNED_BOOKED, linked to the now-active plan.
--             Per-slot LEFT JOIN conflict guard prevents overwriting another provider.
--
-- SAFE TO RE-RUN: Step A is idempotent (active_bp guard); Step B only touches
-- ASSIGNED_AVAILABLE events with no booking plan.

-- ── Step A: Re-activate the most recently deactivated plan ───────────────────
UPDATE office_booking_plans bp
JOIN (
  SELECT standing_assignment_id, MAX(id) AS max_plan_id
  FROM office_booking_plans
  WHERE is_active = FALSE
    AND updated_at >= DATE_SUB(NOW(), INTERVAL 90 DAY)
  GROUP BY standing_assignment_id
) latest ON latest.max_plan_id = bp.id
JOIN office_standing_assignments osa
  ON osa.id = bp.standing_assignment_id
  AND osa.is_active = TRUE
LEFT JOIN office_booking_plans active_bp
  ON active_bp.standing_assignment_id = bp.standing_assignment_id
  AND active_bp.is_active = TRUE
SET
  bp.is_active  = TRUE,
  bp.updated_at = CURRENT_TIMESTAMP
WHERE active_bp.id IS NULL
  AND EXISTS (
    SELECT 1 FROM office_events oe
    WHERE oe.standing_assignment_id = bp.standing_assignment_id
      AND oe.slot_state = 'ASSIGNED_AVAILABLE'
      AND (oe.status IS NULL OR UPPER(oe.status) NOT IN ('CANCELLED', 'BOOKED'))
      AND oe.booking_plan_id IS NULL
      AND oe.start_at >= NOW()
  )
  AND NOT EXISTS (
    SELECT 1
    FROM office_events released_oe
    JOIN office_events conflict_oe
      ON conflict_oe.room_id   = released_oe.room_id
      AND conflict_oe.start_at = released_oe.start_at
      AND conflict_oe.end_at   = released_oe.end_at
      AND conflict_oe.id      <> released_oe.id
      AND conflict_oe.slot_state IN ('ASSIGNED_BOOKED', 'ASSIGNED_AVAILABLE')
      AND (conflict_oe.status IS NULL OR UPPER(conflict_oe.status) NOT IN ('CANCELLED', 'RELEASED'))
    WHERE released_oe.standing_assignment_id = bp.standing_assignment_id
      AND released_oe.slot_state = 'ASSIGNED_AVAILABLE'
      AND (released_oe.status IS NULL OR UPPER(released_oe.status) NOT IN ('CANCELLED', 'BOOKED'))
      AND released_oe.booking_plan_id IS NULL
      AND released_oe.start_at >= NOW()
  );

-- ── Step B: Mark future ASSIGNED_AVAILABLE events as BOOKED ──────────────────
--            Handles both status = NULL (re-materialized) and status = 'RELEASED'
--            (lingering from the original downgrade wipe).
--            LEFT JOIN anti-join skips slots where another provider is present.
UPDATE office_events oe
JOIN office_standing_assignments osa
  ON osa.id = oe.standing_assignment_id
  AND osa.is_active = TRUE
JOIN office_booking_plans bp
  ON bp.standing_assignment_id = osa.id
  AND bp.is_active = TRUE
LEFT JOIN office_events conflict
  ON conflict.room_id   = oe.room_id
  AND conflict.start_at = oe.start_at
  AND conflict.end_at   = oe.end_at
  AND conflict.id      <> oe.id
  AND conflict.slot_state IN ('ASSIGNED_BOOKED', 'ASSIGNED_AVAILABLE')
  AND (conflict.status IS NULL OR UPPER(conflict.status) NOT IN ('CANCELLED', 'RELEASED'))
  AND conflict.assigned_provider_id <> osa.provider_id
SET
  oe.status             = 'BOOKED',
  oe.slot_state         = 'ASSIGNED_BOOKED',
  oe.booked_provider_id = osa.provider_id,
  oe.booking_plan_id    = bp.id,
  oe.updated_at         = CURRENT_TIMESTAMP
WHERE oe.slot_state      = 'ASSIGNED_AVAILABLE'
  AND (oe.status IS NULL OR UPPER(oe.status) NOT IN ('CANCELLED', 'BOOKED'))
  AND oe.booking_plan_id IS NULL
  AND oe.start_at        >= NOW()
  AND conflict.id        IS NULL;
