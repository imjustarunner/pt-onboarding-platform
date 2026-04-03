-- Challenge task library: rich criteria on weekly tasks + reusable template store.

-- Rich criteria and season-long flag on existing weekly tasks
ALTER TABLE challenge_weekly_tasks
  ADD COLUMN criteria_json JSON NULL,
  ADD COLUMN is_season_long TINYINT(1) NOT NULL DEFAULT 0;

-- Reusable challenge template library scoped to a club
CREATE TABLE IF NOT EXISTS challenge_task_templates (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  agency_id       INT          NOT NULL,
  name            VARCHAR(255) NOT NULL,
  description     TEXT         NULL,
  criteria_json   JSON         NULL,
  proof_policy    VARCHAR(50)  NOT NULL DEFAULT 'none',
  mode            ENUM('full_team','volunteer_or_elect','captain_assigns') NOT NULL DEFAULT 'volunteer_or_elect',
  is_season_long  TINYINT(1)   NOT NULL DEFAULT 0,
  ai_generated    TINYINT(1)   NOT NULL DEFAULT 0,
  created_by      INT          NULL,
  created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_ctt_agency (agency_id),
  CONSTRAINT fk_ctt_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
);
