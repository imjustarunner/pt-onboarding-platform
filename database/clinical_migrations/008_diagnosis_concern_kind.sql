-- Migration 008: Areas of concern for learning clients (non-ICD diagnoses)

ALTER TABLE clinical_diagnoses
  ADD COLUMN concern_kind VARCHAR(32) NULL DEFAULT 'clinical'
    COMMENT 'clinical | learning_concern — learning uses free-text description as primary label'
    AFTER description;

-- Existing rows stay clinical; learning concerns use placeholder LC-* codes when no ICD.
UPDATE clinical_diagnoses
SET concern_kind = 'clinical'
WHERE concern_kind IS NULL;
