-- Migration 010: baseline scale, plan-level kiosk share, third-person kiosk prompt

ALTER TABLE clinical_treatment_plans
  ADD COLUMN kiosk_share_enabled TINYINT(1) NOT NULL DEFAULT 0
    COMMENT '1 = offer this plan self-ratings at kiosk check-in';

ALTER TABLE clinical_treatment_plan_objectives
  ADD COLUMN scale_start TINYINT NULL
    COMMENT 'Baseline scale when the objective was written; not overwritten by session ratings'
    AFTER scale_current,
  ADD COLUMN kiosk_prompt_other VARCHAR(500) NULL
    COMMENT 'Third-person rating question (guardian/teacher/other)';

UPDATE clinical_treatment_plan_objectives
SET scale_start = scale_current
WHERE scale_start IS NULL
  AND scale_current IS NOT NULL;
