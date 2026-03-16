-- Summit Stats Challenge: Teams, Workouts, and Challenge Configuration
-- Extends learning_program_classes (internally "classes", UI displays as "Challenges")
-- Teams exist within each challenge; providers submit workouts that contribute to team points.

-- challenge_teams: Teams within a challenge (learning_program_classes)
CREATE TABLE IF NOT EXISTS challenge_teams (
  id INT AUTO_INCREMENT PRIMARY KEY,
  learning_class_id INT NOT NULL COMMENT 'FK to learning_program_classes (challenge)',
  team_name VARCHAR(255) NOT NULL,
  team_manager_user_id INT NULL COMMENT 'provider_plus user assigned as Team Manager/Team Lead',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_challenge_teams_class (learning_class_id),
  CONSTRAINT fk_challenge_teams_class
    FOREIGN KEY (learning_class_id) REFERENCES learning_program_classes(id) ON DELETE CASCADE,
  CONSTRAINT fk_challenge_teams_manager
    FOREIGN KEY (team_manager_user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- challenge_team_members: Provider membership in teams
CREATE TABLE IF NOT EXISTS challenge_team_members (
  id INT AUTO_INCREMENT PRIMARY KEY,
  team_id INT NOT NULL,
  provider_user_id INT NOT NULL,
  joined_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_challenge_team_member (team_id, provider_user_id),
  INDEX idx_challenge_team_members_team (team_id),
  INDEX idx_challenge_team_members_provider (provider_user_id),
  CONSTRAINT fk_challenge_team_members_team
    FOREIGN KEY (team_id) REFERENCES challenge_teams(id) ON DELETE CASCADE,
  CONSTRAINT fk_challenge_team_members_provider
    FOREIGN KEY (provider_user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- challenge_workouts: Workout submissions for challenges
CREATE TABLE IF NOT EXISTS challenge_workouts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  learning_class_id INT NOT NULL COMMENT 'Challenge (learning_program_classes)',
  team_id INT NULL COMMENT 'Team this workout contributes to',
  user_id INT NOT NULL COMMENT 'Provider who submitted',
  activity_type VARCHAR(64) NOT NULL COMMENT 'e.g. running, cycling, workout_session, steps',
  distance_value DECIMAL(10,2) NULL COMMENT 'Miles or km depending on activity',
  duration_minutes INT NULL,
  points INT NOT NULL DEFAULT 0,
  workout_notes TEXT NULL,
  screenshot_file_path VARCHAR(1024) NULL,
  completed_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_challenge_workouts_class (learning_class_id),
  INDEX idx_challenge_workouts_team (team_id),
  INDEX idx_challenge_workouts_user (user_id),
  INDEX idx_challenge_workouts_completed (completed_at),
  INDEX idx_challenge_workouts_class_completed (learning_class_id, completed_at),
  CONSTRAINT fk_challenge_workouts_class
    FOREIGN KEY (learning_class_id) REFERENCES learning_program_classes(id) ON DELETE CASCADE,
  CONSTRAINT fk_challenge_workouts_team
    FOREIGN KEY (team_id) REFERENCES challenge_teams(id) ON DELETE SET NULL,
  CONSTRAINT fk_challenge_workouts_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Extend learning_program_classes with Summit Stats Challenge configuration
ALTER TABLE learning_program_classes
  ADD COLUMN activity_types_json JSON NULL COMMENT 'Allowed activity types: running, cycling, workout_session, steps' AFTER metadata_json,
  ADD COLUMN scoring_rules_json JSON NULL COMMENT 'Points per activity type, per mile, etc.' AFTER activity_types_json,
  ADD COLUMN weekly_goal_minimum INT NULL COMMENT 'Optional minimum activities/points per week' AFTER scoring_rules_json;
