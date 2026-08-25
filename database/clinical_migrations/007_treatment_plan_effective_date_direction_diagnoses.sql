-- Migration 007: Treatment plan effective date, objective scale direction, ordered plan diagnoses

ALTER TABLE clinical_treatment_plans
  ADD COLUMN effective_date DATE NULL
    COMMENT 'Plan effective / written date from import or clinician'
    AFTER title;

ALTER TABLE clinical_treatment_plan_objectives
  ADD COLUMN scale_direction ENUM('increase', 'decrease') NULL
    COMMENT 'Whether progress moves current toward a higher or lower target'
    AFTER scale_target;

CREATE TABLE IF NOT EXISTS clinical_treatment_plan_diagnoses (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  treatment_plan_id BIGINT NOT NULL,
  diagnosis_id BIGINT NOT NULL,
  sort_order INT NOT NULL DEFAULT 1,
  is_primary TINYINT(1) NOT NULL DEFAULT 0,
  justification TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_ctpdx_plan_dx (treatment_plan_id, diagnosis_id),
  INDEX idx_ctpdx_plan_order (treatment_plan_id, sort_order),
  CONSTRAINT fk_ctpdx_plan FOREIGN KEY (treatment_plan_id)
    REFERENCES clinical_treatment_plans(id) ON DELETE CASCADE,
  CONSTRAINT fk_ctpdx_dx FOREIGN KEY (diagnosis_id)
    REFERENCES clinical_diagnoses(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
