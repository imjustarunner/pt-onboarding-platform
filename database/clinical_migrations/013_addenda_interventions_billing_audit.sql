-- Clinical 013: objective interventions, note addenda, billing amendment audit

ALTER TABLE clinical_treatment_plan_objectives
  ADD COLUMN interventions_json JSON NULL
  COMMENT 'Array of intervention names copied from the treatment plan for this objective';

CREATE TABLE IF NOT EXISTS clinical_note_addenda (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  clinical_note_id BIGINT NOT NULL,
  agency_id INT NOT NULL,
  client_id INT NOT NULL,
  body TEXT NOT NULL,
  created_by_user_id INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_cna_note (clinical_note_id),
  INDEX idx_cna_client (agency_id, client_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS clinical_billing_amendments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  clinical_session_id BIGINT NULL,
  clinical_note_id BIGINT NULL,
  agency_id INT NOT NULL,
  changed_by_user_id INT NOT NULL,
  field_key VARCHAR(64) NOT NULL,
  from_value VARCHAR(500) NULL,
  to_value VARCHAR(500) NULL,
  reason VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_cba_session (clinical_session_id),
  INDEX idx_cba_note (clinical_note_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
