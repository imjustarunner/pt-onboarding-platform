-- Migration 807: challenge_matchups table for weekly round-robin matchup tracking
-- Stores one row per team pairing per week. Winner is resolved when the week is closed.

CREATE TABLE IF NOT EXISTS challenge_matchups (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  learning_class_id INT NOT NULL,
  week_start_date DATE NOT NULL,
  team1_id INT NOT NULL,
  team2_id INT NOT NULL,
  winner_team_id INT NULL DEFAULT NULL,
  team1_points DECIMAL(10,2) NULL DEFAULT NULL,
  team2_points DECIMAL(10,2) NULL DEFAULT NULL,
  is_tie TINYINT(1) NOT NULL DEFAULT 0,
  resolved_at DATETIME NULL DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_matchup (learning_class_id, week_start_date, team1_id),
  KEY idx_matchup_class (learning_class_id),
  KEY idx_matchup_week (learning_class_id, week_start_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
