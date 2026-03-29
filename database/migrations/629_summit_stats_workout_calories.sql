-- Summit Stats Challenge: optional calories input for fitness-based events

ALTER TABLE challenge_workouts
  ADD COLUMN calories_burned INT NULL AFTER duration_minutes;
