-- One-off data fix: reinstate office standing assignments auto-forfeited by
-- OfficeScheduleWatchdogService.autoForfeitStaleAvailableSlots on April 9, 2026 ~6:01 PM.
--
-- STEP 1: Run the SELECT below first and verify the count is ~753 before executing the UPDATE.
-- Adjust @min_updated_at if the count is off (narrow the window toward 18:01:07 if needed).
--
-- STEP 2: After reinstatement, deploy the updated officeScheduleWatchdog.service.js (two-phase
-- forfeit with 14-day warning gate) BEFORE the next daily watchdog run (midnight). Otherwise
-- the watchdog may re-forfeit the same rows.

SET @min_updated_at = '2026-04-09 18:01:00';

-- Preview (should return ~753):
SELECT COUNT(*) AS cnt
FROM office_standing_assignments osa
LEFT JOIN office_booking_plans bp
  ON bp.standing_assignment_id = osa.id AND bp.is_active = TRUE
WHERE osa.is_active = FALSE
  AND osa.availability_mode = 'AVAILABLE'
  AND osa.available_since_date IS NOT NULL
  AND bp.id IS NULL
  AND osa.updated_at >= @min_updated_at;

-- Reinstate and bump last_two_week_confirmed_at to NOW so the 42-day stale clock resets:
UPDATE office_standing_assignments osa
LEFT JOIN office_booking_plans bp
  ON bp.standing_assignment_id = osa.id AND bp.is_active = TRUE
SET
  osa.is_active = TRUE,
  osa.last_two_week_confirmed_at = NOW(),
  osa.updated_at = CURRENT_TIMESTAMP
WHERE osa.is_active = FALSE
  AND osa.availability_mode = 'AVAILABLE'
  AND osa.available_since_date IS NOT NULL
  AND bp.id IS NULL
  AND osa.updated_at >= @min_updated_at;
