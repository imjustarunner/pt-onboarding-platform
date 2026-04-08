-- Migration 690: Allow decimal points in challenge_workouts (e.g. 3.89 pts for 3.89 mi run)
ALTER TABLE challenge_workouts
  MODIFY COLUMN points DECIMAL(8,2) NOT NULL DEFAULT 0.00;
