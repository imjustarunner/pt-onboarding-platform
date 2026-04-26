-- 813_recognition_grants_workout_week.sql
-- Extend challenge_member_award_grants with:
--   week_number  — explicit 1-based week index (1, 2, 3 …) so trophy case can
--                  display "Won Week 1, Week 4" without date math on the client.
--   workout_id   — FK to the specific challenge_workouts row that triggered the
--                  win; nullable (milestone/season awards may have no single
--                  workout), allows clickable workout links in the UI.

ALTER TABLE challenge_member_award_grants
  ADD COLUMN week_number SMALLINT UNSIGNED NULL AFTER week_start_date,
  ADD COLUMN workout_id  BIGINT UNSIGNED NULL AFTER week_number,
  ADD INDEX idx_class_week (learning_class_id, week_number),
  ADD CONSTRAINT fk_grant_workout
    FOREIGN KEY (workout_id) REFERENCES challenge_workouts(id) ON DELETE SET NULL;
