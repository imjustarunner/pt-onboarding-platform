-- Migration 809: team accent color on challenge_teams
ALTER TABLE challenge_teams
  ADD COLUMN team_color VARCHAR(20) NULL DEFAULT NULL
    COMMENT 'Hex color for team accent (e.g. #6366f1); displayed as left-border on scoreboard cards';
