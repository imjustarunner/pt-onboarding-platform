-- Summit Stats Team Challenge: Weekly Scoreboard, Elimination, Weekly Tasks
-- Week = Sunday to Sunday; configurable start time. Scoreboard posted at end of week.

-- Extend learning_program_classes with scoreboard thresholds
ALTER TABLE learning_program_classes
  ADD COLUMN team_min_points_per_week INT NULL COMMENT 'Team must achieve this many points per week' AFTER weekly_goal_minimum,
  ADD COLUMN individual_min_points_per_week INT NULL COMMENT 'Each person must achieve this many points per week' AFTER team_min_points_per_week,
  ADD COLUMN week_start_time TIME NULL DEFAULT '00:00:00' COMMENT 'Week boundary: Sunday at this time starts new week' AFTER individual_min_points_per_week;

-- challenge_weekly_tasks: 3 challenges per week (Program Manager creates)
CREATE TABLE IF NOT EXISTS challenge_weekly_tasks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  learning_class_id INT NOT NULL,
  week_start_date DATE NOT NULL COMMENT 'Sunday date for this week',
  task_index TINYINT NOT NULL COMMENT '1, 2, or 3',
  name VARCHAR(255) NOT NULL,
  description TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_weekly_task (learning_class_id, week_start_date, task_index),
  INDEX idx_weekly_tasks_class_week (learning_class_id, week_start_date),
  CONSTRAINT fk_weekly_tasks_class
    FOREIGN KEY (learning_class_id) REFERENCES learning_program_classes(id) ON DELETE CASCADE
);

-- challenge_weekly_assignments: One person per task per team (captain assigns or volunteer)
CREATE TABLE IF NOT EXISTS challenge_weekly_assignments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  task_id INT NOT NULL,
  team_id INT NOT NULL,
  provider_user_id INT NOT NULL,
  assigned_by_user_id INT NULL COMMENT 'Captain who assigned, NULL if volunteered',
  volunteered TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_assignment_task_team (task_id, team_id),
  INDEX idx_assignments_task (task_id),
  INDEX idx_assignments_team (team_id),
  INDEX idx_assignments_provider (provider_user_id),
  CONSTRAINT fk_assignments_task
    FOREIGN KEY (task_id) REFERENCES challenge_weekly_tasks(id) ON DELETE CASCADE,
  CONSTRAINT fk_assignments_team
    FOREIGN KEY (team_id) REFERENCES challenge_teams(id) ON DELETE CASCADE,
  CONSTRAINT fk_assignments_provider
    FOREIGN KEY (provider_user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_assignments_assigned_by
    FOREIGN KEY (assigned_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- challenge_weekly_completions: Assignee marks challenge done
CREATE TABLE IF NOT EXISTS challenge_weekly_completions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  assignment_id INT NOT NULL,
  completed_at DATETIME NOT NULL,
  completion_notes TEXT NULL,
  attachment_path VARCHAR(1024) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_completion_assignment (assignment_id),
  CONSTRAINT fk_completions_assignment
    FOREIGN KEY (assignment_id) REFERENCES challenge_weekly_assignments(id) ON DELETE CASCADE
);

-- challenge_weekly_scoreboard: Snapshot at end of week (top 5 athletes, top 5 teams, top per team)
CREATE TABLE IF NOT EXISTS challenge_weekly_scoreboard (
  id INT AUTO_INCREMENT PRIMARY KEY,
  learning_class_id INT NOT NULL,
  week_start_date DATE NOT NULL,
  snapshot_json JSON NOT NULL COMMENT 'top5Athletes, top5Teams, topPerTeam',
  posted_at DATETIME NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_scoreboard_week (learning_class_id, week_start_date),
  INDEX idx_scoreboard_class (learning_class_id),
  CONSTRAINT fk_scoreboard_class
    FOREIGN KEY (learning_class_id) REFERENCES learning_program_classes(id) ON DELETE CASCADE
);

-- challenge_eliminations: Who was eliminated, when, why, admin comment
CREATE TABLE IF NOT EXISTS challenge_eliminations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  learning_class_id INT NOT NULL,
  provider_user_id INT NOT NULL,
  week_start_date DATE NOT NULL,
  reason ENUM('points_failed', 'challenge_not_completed', 'both') NOT NULL,
  admin_comment TEXT NULL,
  eliminated_at DATETIME NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_eliminations_class (learning_class_id),
  INDEX idx_eliminations_provider (provider_user_id),
  INDEX idx_eliminations_week (learning_class_id, week_start_date),
  CONSTRAINT fk_eliminations_class
    FOREIGN KEY (learning_class_id) REFERENCES learning_program_classes(id) ON DELETE CASCADE,
  CONSTRAINT fk_eliminations_provider
    FOREIGN KEY (provider_user_id) REFERENCES users(id) ON DELETE CASCADE
);
