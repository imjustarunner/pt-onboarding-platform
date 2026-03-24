-- One-off data fix: reinstate office standing assignments auto-forfeited by
-- OfficeScheduleWatchdogService.autoForfeitStaleAvailableSlots (sets is_active = FALSE).
--
-- Run manually against production after verifying counts. Adjust @min_updated_at if needed
-- to match the watchdog run (narrow window = safer).
--
-- IMPORTANT: Deploy the backend change to officeScheduleWatchdog.service.js (42-day anchor
-- uses GREATEST(available_since_date, last_two_week_confirmed_at)) before the next watchdog
-- run after this UPDATE. Otherwise the legacy watchdog can re-forfeit the same rows because
-- available_since_date is still old.
--
-- Preview (expect ~312 rows if this matches the forfeiture batch):
--   SET @min_updated_at = '2026-03-23 00:00:00';
--   SELECT COUNT(*) AS cnt
--   FROM office_standing_assignments osa
--   LEFT JOIN office_booking_plans bp ON bp.standing_assignment_id = osa.id AND bp.is_active = TRUE
--   WHERE osa.is_active = FALSE
--     AND osa.availability_mode = 'AVAILABLE'
--     AND osa.available_since_date IS NOT NULL
--     AND osa.available_since_date <= DATE_SUB(CURDATE(), INTERVAL 42 DAY)
--     AND bp.id IS NULL
--     AND osa.updated_at >= @min_updated_at;

SET @min_updated_at = '2026-03-23 00:00:00';

UPDATE office_standing_assignments osa
LEFT JOIN office_booking_plans bp ON bp.standing_assignment_id = osa.id AND bp.is_active = TRUE
SET
  osa.is_active = TRUE,
  osa.last_two_week_confirmed_at = NOW(),
  osa.updated_at = CURRENT_TIMESTAMP
WHERE osa.is_active = FALSE
  AND osa.availability_mode = 'AVAILABLE'
  AND osa.available_since_date IS NOT NULL
  AND osa.available_since_date <= DATE_SUB(CURDATE(), INTERVAL 42 DAY)
  AND bp.id IS NULL
  AND osa.updated_at >= @min_updated_at;
