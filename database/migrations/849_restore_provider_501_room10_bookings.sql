-- Migration 849: Restore all standing assignments and booking plans for
-- provider 501 in room #10 (Counseling Office).
--
-- WHAT HAPPENED:
--   Provider 501's Thursday and Saturday assignments in room #10 were forfeited
--   by the auto-forfeit watchdog in March 2026 because they never completed the
--   booking plan confirmation flow (they were in ASSIGNED_AVAILABLE state since
--   Feb 2026 and hit the 42-day stale threshold without a confirmed booking plan).
--   This migration re-activates all of those assignments and creates confirmed
--   booking plans so they appear as ASSIGNED_BOOKED going forward.
--
-- STEPS:
--   A — Re-activate all is_active=FALSE assignments for provider 501 in room #10.
--   B — Create booking plans for any of those that don't already have one.
--   C — Update existing future ASSIGNED_AVAILABLE events for those assignments
--       to ASSIGNED_BOOKED, linked to their new booking plan.
--   D — Fix assignment 6 (room #2 / Play Room): its future events are stuck in
--       RELEASED state despite having an active booking plan (plan 5).

-- ── Step A: Re-activate the standing assignments ─────────────────────────────
UPDATE office_standing_assignments
SET
  is_active                  = TRUE,
  last_two_week_confirmed_at = NOW(),
  last_forfeit_warning_at    = NULL,
  updated_at                 = CURRENT_TIMESTAMP
WHERE provider_id = 501
  AND room_id     = 10
  AND is_active   = FALSE;

-- ── Step B: Create booking plans for assignments that don't have one ─────────
INSERT INTO office_booking_plans (
  standing_assignment_id,
  booked_frequency,
  booking_start_date,
  active_until_date,
  booked_occurrence_count,
  last_confirmed_at,
  is_active,
  created_by_user_id,
  booking_origin,
  user_booking_confirmed_at,
  created_at,
  updated_at
)
SELECT
  osa.id,
  osa.assigned_frequency,
  CURDATE(),
  DATE_ADD(CURDATE(), INTERVAL 1 YEAR),
  NULL,
  NOW(),
  1,
  1,
  'user',
  NOW(),
  NOW(),
  NOW()
FROM office_standing_assignments osa
WHERE osa.room_id    = 10
  AND osa.provider_id = 501
  AND osa.is_active   = TRUE
  AND NOT EXISTS (
    SELECT 1 FROM office_booking_plans bp
    WHERE bp.standing_assignment_id = osa.id
      AND bp.is_active = TRUE
  );

-- ── Step C: Update existing future AVAILABLE events → BOOKED ─────────────────
UPDATE office_events oe
JOIN office_standing_assignments osa
  ON  osa.id          = oe.standing_assignment_id
  AND osa.provider_id = 501
  AND osa.room_id     = 10
  AND osa.is_active   = TRUE
JOIN office_booking_plans bp
  ON  bp.standing_assignment_id = osa.id
  AND bp.is_active              = TRUE
LEFT JOIN office_events conflict
  ON  conflict.room_id   = oe.room_id
  AND conflict.start_at  = oe.start_at
  AND conflict.id        <> oe.id
  AND conflict.slot_state = 'ASSIGNED_BOOKED'
  AND (conflict.status IS NULL OR UPPER(conflict.status) NOT IN ('CANCELLED', 'RELEASED'))
SET
  oe.slot_state         = 'ASSIGNED_BOOKED',
  oe.status             = 'BOOKED',
  oe.booked_provider_id = 501,
  oe.booking_plan_id    = bp.id,
  oe.updated_at         = CURRENT_TIMESTAMP
WHERE oe.start_at   >= NOW()
  AND oe.slot_state  = 'ASSIGNED_AVAILABLE'
  AND (oe.status = 'RELEASED' OR oe.status IS NULL)
  AND conflict.id IS NULL;

-- ── Step D: Fix assignment 6 (room #2) — events stuck as RELEASED despite ────
--            having active booking plan 5. ─────────────────────────────────────
UPDATE office_events oe
LEFT JOIN office_events conflict
  ON  conflict.room_id    = oe.room_id
  AND conflict.start_at   = oe.start_at
  AND conflict.id         <> oe.id
  AND conflict.slot_state  = 'ASSIGNED_BOOKED'
  AND (conflict.status IS NULL OR UPPER(conflict.status) NOT IN ('CANCELLED', 'RELEASED'))
SET
  oe.slot_state         = 'ASSIGNED_BOOKED',
  oe.status             = 'BOOKED',
  oe.booked_provider_id = 501,
  oe.booking_plan_id    = 5,
  oe.updated_at         = CURRENT_TIMESTAMP
WHERE oe.standing_assignment_id = 6
  AND oe.slot_state             = 'ASSIGNED_AVAILABLE'
  AND oe.status                 = 'RELEASED'
  AND oe.start_at              >= NOW()
  AND conflict.id IS NULL;
