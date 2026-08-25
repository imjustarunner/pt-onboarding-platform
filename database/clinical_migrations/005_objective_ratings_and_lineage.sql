-- Migration 005: Objective rating history + goal/objective identity lineage
-- Used by Note Aid progress notes and treatment plan updater identity lock.

ALTER TABLE clinical_treatment_plan_goals
  ADD COLUMN content_fingerprint VARCHAR(64) NULL
    COMMENT 'Normalized hash of goal_text; text change => new goal',
  ADD COLUMN replaced_by_id BIGINT NULL
    COMMENT 'When superseded, points at replacement goal row',
  ADD COLUMN superseded_at TIMESTAMP NULL;

ALTER TABLE clinical_treatment_plan_objectives
  ADD COLUMN content_fingerprint VARCHAR(64) NULL
    COMMENT 'Normalized hash of objective_text; text change => new objective',
  ADD COLUMN replaced_by_id BIGINT NULL
    COMMENT 'When superseded, points at replacement objective row',
  ADD COLUMN superseded_at TIMESTAMP NULL,
  ADD COLUMN status VARCHAR(40) NOT NULL DEFAULT 'active'
    COMMENT 'active|superseded|on_hold';

CREATE TABLE IF NOT EXISTS clinical_treatment_objective_ratings (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  client_id INT NOT NULL,
  objective_id BIGINT NOT NULL,
  goal_id BIGINT NULL,
  treatment_plan_id BIGINT NULL,
  rated_by_user_id INT NOT NULL,
  scale_value TINYINT NULL COMMENT '1-10 when disposition=rated; NULL otherwise',
  scale_target_at_rating TINYINT NULL COMMENT 'Snapshot of objective goal scale at rate time',
  disposition VARCHAR(32) NOT NULL DEFAULT 'rated'
    COMMENT 'rated|deferred|on_hold|not_addressed',
  progress_label VARCHAR(32) NULL
    COMMENT 'progressing|improved|regressed|unchanged',
  clinical_note_id BIGINT NULL,
  draft_id BIGINT NULL COMMENT 'Optional Note Aid draft id (main DB; not FK across DBs)',
  date_of_service DATE NULL,
  notes VARCHAR(500) NULL,
  rated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ctor_client (agency_id, client_id, rated_at),
  INDEX idx_ctor_objective (objective_id, rated_at),
  INDEX idx_ctor_plan (treatment_plan_id),
  CONSTRAINT fk_ctor_objective FOREIGN KEY (objective_id)
    REFERENCES clinical_treatment_plan_objectives(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
