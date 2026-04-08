-- Migration 689: Add elevation_gain_meters and average_heartrate to challenge_workouts for Strava import
ALTER TABLE challenge_workouts
  ADD COLUMN elevation_gain_meters FLOAT NULL DEFAULT NULL AFTER calories_burned,
  ADD COLUMN average_heartrate FLOAT NULL DEFAULT NULL AFTER elevation_gain_meters;
