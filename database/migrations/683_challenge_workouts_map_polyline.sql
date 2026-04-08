-- Store encoded polyline from Strava for rendering route maps in the activity feed
ALTER TABLE challenge_workouts
  ADD COLUMN map_summary_polyline TEXT NULL DEFAULT NULL;
