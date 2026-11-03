-- Diagnosis evidence/review is retained separately from immutable signed note versions.
CREATE TABLE IF NOT EXISTS clinical_diagnosis_reviews (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  diagnosis_id BIGINT NOT NULL,
  agency_id INT NOT NULL,
  client_id INT NOT NULL,
  evidence_document_ids_json JSON NULL,
  evaluation_note TEXT NULL,
  qualified_evaluator_user_id INT NULL,
  evaluation_authored_at TIMESTAMP NULL,
  stressor_event_month CHAR(7) NULL,
  review_reason TEXT NOT NULL,
  reviewed_by_user_id INT NOT NULL,
  reviewed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_diagnosis_review (agency_id,client_id,diagnosis_id,id),
  FOREIGN KEY (diagnosis_id) REFERENCES clinical_diagnoses(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS clinical_supervisor_diagnosis_permissions (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  provider_user_id INT NOT NULL,
  supervisor_user_id INT NOT NULL,
  allow_non_f_primary TINYINT(1) NOT NULL DEFAULT 0,
  reason TEXT NOT NULL,
  changed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_supervisor_diagnosis_policy (agency_id,provider_user_id,supervisor_user_id,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TRIGGER clinical_diagnosis_review_no_update BEFORE UPDATE ON clinical_diagnosis_reviews FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Diagnosis evidence reviews are append-only';
CREATE TRIGGER clinical_diagnosis_review_no_delete BEFORE DELETE ON clinical_diagnosis_reviews FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Diagnosis evidence reviews cannot be deleted';
CREATE TRIGGER clinical_diagnosis_permission_no_update BEFORE UPDATE ON clinical_supervisor_diagnosis_permissions FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Supervisor diagnosis permissions are append-only';
CREATE TRIGGER clinical_diagnosis_permission_no_delete BEFORE DELETE ON clinical_supervisor_diagnosis_permissions FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Supervisor diagnosis permission history cannot be deleted';
