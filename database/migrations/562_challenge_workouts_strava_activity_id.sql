-- Summit Stats Challenge: Strava activity ID for selective import and duplicate prevention
ALTER TABLE challenge_workouts
  ADD COLUMN strava_activity_id BIGINT NULL COMMENT 'Strava activity ID when imported from Strava' AFTER completed_at,
  ADD UNIQUE KEY uniq_challenge_workouts_strava (learning_class_id, user_id, strava_activity_id);
