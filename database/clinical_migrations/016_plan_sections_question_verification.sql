ALTER TABLE clinical_treatment_plans
  ADD COLUMN presenting_problem TEXT NULL,
  ADD COLUMN prescribed_frequency VARCHAR(255) NULL;
ALTER TABLE clinical_treatment_plan_objectives
  ADD COLUMN kiosk_prompt_verified_at DATETIME NULL,
  ADD COLUMN kiosk_prompt_verified_by INT NULL,
  ADD COLUMN kiosk_prompt_other_verified_at DATETIME NULL,
  ADD COLUMN kiosk_prompt_other_verified_by INT NULL;
