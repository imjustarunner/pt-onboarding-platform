-- Migration 006: Diagnosis justification + plan/note primary-dx attachment (intake chart spine)

ALTER TABLE clinical_diagnoses
  ADD COLUMN justification TEXT NULL
    COMMENT 'Clinical diagnostic justification (from intake HITL or clinician)'
    AFTER description;

ALTER TABLE clinical_treatment_plans
  ADD COLUMN primary_diagnosis_id BIGINT NULL
    COMMENT 'FK to clinical_diagnoses.id — primary dx for this plan',
  ADD COLUMN diagnostic_justification TEXT NULL
    COMMENT 'Snapshot of justification at plan save / finalize';

ALTER TABLE clinical_notes
  ADD COLUMN primary_diagnosis_id BIGINT NULL
    COMMENT 'FK to clinical_diagnoses.id — primary dx for this progress/session note',
  ADD COLUMN diagnostic_justification TEXT NULL
    COMMENT 'Snapshot of justification when note was approved/persisted';
