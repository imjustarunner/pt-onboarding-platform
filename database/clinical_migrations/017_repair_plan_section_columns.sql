-- Repair databases where migration 016 was missing or partially applied.
-- Separate statements let the migration runner skip each existing column independently.
ALTER TABLE clinical_treatment_plans ADD COLUMN presenting_problem TEXT NULL;
ALTER TABLE clinical_treatment_plans ADD COLUMN prescribed_frequency VARCHAR(255) NULL;
ALTER TABLE clinical_treatment_plan_objectives ADD COLUMN kiosk_prompt_verified_at DATETIME NULL;
ALTER TABLE clinical_treatment_plan_objectives ADD COLUMN kiosk_prompt_verified_by INT NULL;
ALTER TABLE clinical_treatment_plan_objectives ADD COLUMN kiosk_prompt_other_verified_at DATETIME NULL;
ALTER TABLE clinical_treatment_plan_objectives ADD COLUMN kiosk_prompt_other_verified_by INT NULL;
