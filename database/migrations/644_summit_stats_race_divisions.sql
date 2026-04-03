-- Summit Stats: add is_race flag to challenge_workouts.
-- Any run submitted with distance >= 13.1 mi is auto-flagged by the backend.

ALTER TABLE challenge_workouts
  ADD COLUMN is_race TINYINT(1) NOT NULL DEFAULT 0;
