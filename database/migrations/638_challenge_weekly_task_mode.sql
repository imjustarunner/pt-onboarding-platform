-- Weekly Challenge Task: per-task assignment mode
-- Replaces the season-level challengeAssignmentMode for individual tasks,
-- so each of the 3 weekly tasks can independently be full_team, volunteer_or_elect, or captain_assigns.

ALTER TABLE challenge_weekly_tasks
  ADD COLUMN mode ENUM('full_team', 'volunteer_or_elect', 'captain_assigns')
  NOT NULL DEFAULT 'volunteer_or_elect' AFTER task_index;
