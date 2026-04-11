-- Live draft session state for SSTC team draft rooms
-- One row per season (UNIQUE on learning_class_id).
-- pick_queue_json holds the pre-computed team pick order (snake-expanded or randomized).
-- Actual roster writes go to challenge_team_members.

CREATE TABLE IF NOT EXISTS challenge_draft_sessions (
  id                  INT           NOT NULL AUTO_INCREMENT,
  learning_class_id   INT           NOT NULL,
  status              ENUM('pending','in_progress','completed','cancelled')
                                    NOT NULL DEFAULT 'pending',
  draft_mode          ENUM('snake','random') NOT NULL DEFAULT 'snake',
  pick_queue_json     JSON          NOT NULL
                      COMMENT 'Ordered array of team_ids — snake-expanded or shuffled',
  current_pick_index  INT           NOT NULL DEFAULT 0,
  started_at          DATETIME      NULL,
  completed_at        DATETIME      NULL,
  created_by_user_id  INT           NULL,
  created_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP
                                    ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_session_per_class (learning_class_id),
  KEY idx_status (status)
);
