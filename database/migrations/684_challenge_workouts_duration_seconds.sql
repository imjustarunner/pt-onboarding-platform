-- Add sub-minute seconds to workout duration for accurate pace calculation
-- duration_minutes stores whole minutes; duration_seconds stores 0-59 remainder seconds
ALTER TABLE challenge_workouts
  ADD COLUMN duration_seconds TINYINT UNSIGNED NULL DEFAULT NULL
  AFTER duration_minutes;
