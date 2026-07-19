-- Migration 002: Medical billing foundations (gated feature stack)
-- Encounter fields, signing, diagnoses, structured treatment plans, claim lines, fee schedules

-- Encounter enrichment on clinical_sessions
ALTER TABLE clinical_sessions
  ADD COLUMN encounter_status VARCHAR(32) NOT NULL DEFAULT 'scheduled'
    COMMENT 'scheduled|checked_in|completed|no_show|cancelled',
  ADD COLUMN place_of_service VARCHAR(8) NULL
    COMMENT 'CMS POS code e.g. 02,10,11',
  ADD COLUMN duration_minutes INT NULL,
  ADD COLUMN is_telehealth TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN rendering_provider_user_id INT NULL;

-- Note signing / amendments on clinical_notes
ALTER TABLE clinical_notes
  ADD COLUMN note_type VARCHAR(80) NULL,
  ADD COLUMN version_number INT NOT NULL DEFAULT 1,
  ADD COLUMN parent_note_id BIGINT NULL COMMENT 'Prior version when this row is an amendment',
  ADD COLUMN content_hash VARCHAR(128) NULL,
  ADD COLUMN provider_signed_at TIMESTAMP NULL,
  ADD COLUMN provider_signed_by_user_id INT NULL,
  ADD COLUMN supervisor_cosigned_at TIMESTAMP NULL,
  ADD COLUMN supervisor_cosigned_by_user_id INT NULL,
  ADD COLUMN is_billable TINYINT(1) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS clinical_diagnoses (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  client_id INT NOT NULL,
  clinical_session_id BIGINT NULL,
  clinical_note_id BIGINT NULL,
  icd10_code VARCHAR(16) NOT NULL,
  description VARCHAR(500) NULL,
  is_primary TINYINT(1) NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  onset_date DATE NULL,
  created_by_user_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_clinical_dx_client (agency_id, client_id, is_active),
  INDEX idx_clinical_dx_session (clinical_session_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS clinical_treatment_plans (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  client_id INT NOT NULL,
  clinical_session_id BIGINT NULL,
  clinical_note_id BIGINT NULL,
  title VARCHAR(255) NOT NULL DEFAULT 'Treatment Plan',
  status VARCHAR(40) NOT NULL DEFAULT 'active',
  discharge_plan TEXT NULL,
  source_tool_id VARCHAR(80) NULL,
  created_by_user_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_ctp_client (agency_id, client_id),
  INDEX idx_ctp_session (clinical_session_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS clinical_treatment_plan_goals (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  treatment_plan_id BIGINT NOT NULL,
  goal_index INT NOT NULL DEFAULT 1,
  goal_text TEXT NOT NULL,
  projected_completion VARCHAR(120) NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_ctpg_plan (treatment_plan_id),
  CONSTRAINT fk_ctpg_plan FOREIGN KEY (treatment_plan_id) REFERENCES clinical_treatment_plans(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS clinical_treatment_plan_objectives (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  goal_id BIGINT NOT NULL,
  objective_index INT NOT NULL DEFAULT 1,
  objective_text TEXT NOT NULL,
  scale_current TINYINT NULL,
  scale_target TINYINT NULL,
  measurement_method VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_ctpo_goal (goal_id),
  CONSTRAINT fk_ctpo_goal FOREIGN KEY (goal_id) REFERENCES clinical_treatment_plan_goals(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS medical_fee_schedule_items (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  payer_label VARCHAR(120) NULL,
  procedure_code VARCHAR(16) NOT NULL,
  modifier VARCHAR(12) NULL,
  description VARCHAR(500) NULL,
  unit_price_cents INT NOT NULL DEFAULT 0,
  unit_minutes INT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_mfs_agency_code (agency_id, procedure_code, is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Expand clinical_claims for real claim lifecycle (columns additive)
ALTER TABLE clinical_claims
  ADD COLUMN clinical_note_id BIGINT NULL,
  ADD COLUMN payer_name VARCHAR(255) NULL,
  ADD COLUMN member_id VARCHAR(80) NULL,
  ADD COLUMN billing_npi VARCHAR(20) NULL,
  ADD COLUMN rendering_npi VARCHAR(20) NULL,
  ADD COLUMN taxonomy_code VARCHAR(20) NULL,
  ADD COLUMN place_of_service VARCHAR(8) NULL,
  ADD COLUMN date_of_service DATE NULL,
  ADD COLUMN claim_lifecycle VARCHAR(40) NOT NULL DEFAULT 'draft'
    COMMENT 'draft|ready|queued|submitted|accepted|rejected|denied|paid|adjusted',
  ADD COLUMN claimmd_claim_id VARCHAR(80) NULL,
  ADD COLUMN claimmd_last_status VARCHAR(120) NULL,
  ADD COLUMN claimmd_submitted_at TIMESTAMP NULL,
  ADD COLUMN diagnosis_codes_json JSON NULL;

CREATE TABLE IF NOT EXISTS clinical_claim_lines (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  clinical_claim_id BIGINT NOT NULL,
  line_number INT NOT NULL DEFAULT 1,
  procedure_code VARCHAR(16) NOT NULL,
  modifiers_json JSON NULL,
  units DECIMAL(8,2) NOT NULL DEFAULT 1,
  charge_cents INT NOT NULL DEFAULT 0,
  diagnosis_pointers VARCHAR(40) NULL COMMENT 'e.g. 1,2',
  clinical_note_id BIGINT NULL,
  service_date DATE NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_ccl_claim (clinical_claim_id),
  CONSTRAINT fk_ccl_claim FOREIGN KEY (clinical_claim_id) REFERENCES clinical_claims(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
