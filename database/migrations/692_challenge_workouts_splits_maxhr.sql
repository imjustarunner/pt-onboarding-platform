-- Migration 692: Add max heart rate and mile splits storage to challenge_workouts
ALTER TABLE challenge_workouts
  ADD COLUMN max_heartrate    SMALLINT UNSIGNED NULL DEFAULT NULL
    COMMENT 'Peak heart rate (bpm) from Strava import' AFTER average_heartrate,
  ADD COLUMN splits_json      JSON NULL DEFAULT NULL
    COMMENT 'Strava splits_standard array: per-mile pace, HR, elevation' AFTER max_heartrate;
