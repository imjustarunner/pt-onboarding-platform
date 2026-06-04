-- Migration 848: Reinstate standing assignments that were auto-forfeited as a
-- downstream consequence of the downgradeBookedWithoutExternalOverlap bug.
--
-- CHAIN OF EVENTS:
--   1. ~April 5:  downgradeBookedWithoutExternalOverlap deactivated booking plans
--                 and reset available_since_date = today for affected assignments.
--   2. ~May 17:   autoForfeitStaleAvailableSlots B1 fired (42-day stale threshold
--                 reached), sending forfeit warnings and setting last_forfeit_warning_at.
--   3. ~May 31:   B2 fired (14 days after warning), setting is_active = FALSE on
--                 those same assignments — making them invisible to the materializer.
--
-- IDENTIFYING VICTIMS:
--   Assignments that were legitimately forfeited (genuinely stale, never booked)
--   would NOT have a recently deactivated booking plan.  Assignments caught by this
--   bug DO — they have a plan deactivated within the last 90 days.
--
-- WHAT THIS DOES:
--   Step A — Reinstate is_active = TRUE on victim assignments, clear the forfeit
--             warning clock, and reset last_two_week_confirmed_at to NOW so the
--             42-day stale clock starts fresh.
--   Step B — Re-activate their most recently deactivated booking plan so the
--             materializer generates ASSIGNED_BOOKED (not just ASSIGNED_AVAILABLE)
--             events on next load.

-- ── Step A: Reinstate the standing assignments ────────────────────────────────
UPDATE office_standing_assignments osa
LEFT JOIN office_booking_plans active_bp
  ON active_bp.standing_assignment_id = osa.id AND active_bp.is_active = TRUE
SET
  osa.is_active                  = TRUE,
  osa.last_two_week_confirmed_at = NOW(),
  osa.last_forfeit_warning_at    = NULL,
  osa.updated_at                 = CURRENT_TIMESTAMP
WHERE osa.is_active = FALSE
  AND osa.last_forfeit_warning_at IS NOT NULL
  AND active_bp.id IS NULL
  AND EXISTS (
    SELECT 1 FROM office_booking_plans bp
    WHERE bp.standing_assignment_id = osa.id
      AND bp.is_active  = FALSE
      AND bp.updated_at >= DATE_SUB(NOW(), INTERVAL 90 DAY)
  );

-- ── Step B: Re-activate the most recently deactivated plan for each reinstated
--            assignment so the materializer creates ASSIGNED_BOOKED events. ────
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
WHERE active_bp.id IS NULL;
