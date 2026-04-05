-- Summit Stats Team Challenge: optional weekly challenge tag per workout
-- Keep migration runner-compatible: no PREPARE/EXECUTE blocks.

ALTER TABLE challenge_workouts
  ADD COLUMN weekly_task_id INT NULL AFTER strava_activity_id,
  ADD INDEX idx_challenge_workouts_weekly_task (weekly_task_id);
