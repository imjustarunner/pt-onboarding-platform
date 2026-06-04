-- Migration 846: Reinstate booking plans and future office events wiped by
-- downgradeBookedWithoutExternalOverlap.
--
-- SAFE TO RUN VIA npm run migrate — no manual steps required.
-- Both updates have built-in conflict guards:
--   • An assignment is skipped entirely if any of its future slots are already
--     occupied by another provider (avoids double-booking).
--   • Each individual slot is skipped if another provider is currently in that
--     same room + time (per-slot safety net).
-- After running, use the Booking Conflict Resolver page in the admin panel to
-- review and resolve any slots that were skipped due to conflicts.
--
-- NOTE: If this migration previously failed mid-run (Step A ran, Step B did not),
-- re-running is safe — Step A is idempotent and Step B was rewritten to use a
-- LEFT JOIN anti-join instead of NOT EXISTS to avoid the MySQL restriction on
-- referencing the update target table in a correlated subquery.

-- ── Step A: Re-activate the most recently deactivated booking plan
--            per affected assignment, skipping any with slot conflicts. ─────────
UPDATE office_booking_plans bp
JOIN (
  SELECT standing_assignment_id, MAX(id) AS max_plan_id
  FROM office_booking_plans
  WHERE is_active = FALSE
    AND updated_at >= DATE_SUB(NOW(), INTERVAL 60 DAY)
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
      AND oe.status = 'RELEASED'
      AND oe.booking_plan_id IS NULL
      AND oe.start_at >= NOW()
      AND oe.updated_at >= DATE_SUB(NOW(), INTERVAL 60 DAY)
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
      AND released_oe.status = 'RELEASED'
      AND released_oe.booking_plan_id IS NULL
      AND released_oe.start_at >= NOW()
  );

-- ── Step B: Restore future events to BOOKED, skipping any slot where another
--            provider is already occupying that room + time.
--            Uses LEFT JOIN anti-join (conflict.id IS NULL) instead of a
--            NOT EXISTS correlated subquery to avoid MySQL ER_UPDATE_TABLE_USED. ──
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
SET
  oe.status             = 'BOOKED',
  oe.slot_state         = 'ASSIGNED_BOOKED',
  oe.booked_provider_id = osa.provider_id,
  oe.booking_plan_id    = bp.id,
  oe.updated_at         = CURRENT_TIMESTAMP
WHERE oe.slot_state      = 'ASSIGNED_AVAILABLE'
  AND oe.status          = 'RELEASED'
  AND oe.booking_plan_id IS NULL
  AND oe.start_at        >= NOW()
  AND oe.updated_at      >= DATE_SUB(NOW(), INTERVAL 60 DAY)
  AND conflict.id        IS NULL;
