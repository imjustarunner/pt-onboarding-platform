-- Migration 009: rater kind (clinician / client / other) + kiosk self-rate prompt

ALTER TABLE clinical_treatment_objective_ratings
  ADD COLUMN rater_kind VARCHAR(24) NOT NULL DEFAULT 'clinician'
    COMMENT 'clinician|client|other',
  ADD COLUMN rater_label VARCHAR(120) NULL
    COMMENT 'Display name/role when rater_kind=other';

ALTER TABLE clinical_treatment_plan_objectives
  ADD COLUMN kiosk_prompt VARCHAR(500) NULL
    COMMENT 'Self-rating question shown at kiosk / to the client',
  ADD COLUMN kiosk_self_rate_enabled TINYINT(1) NOT NULL DEFAULT 1
    COMMENT '1 = offer this objective on kiosk check-in';
