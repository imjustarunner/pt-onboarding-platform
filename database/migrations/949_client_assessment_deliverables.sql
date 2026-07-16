-- Migration 949: client assessment deliverables hub (results + plans)
-- Soft version bump on main row; no versions table for MVP.

CREATE TABLE IF NOT EXISTS client_assessment_deliverables (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  client_id INT NOT NULL,
  assessment_family VARCHAR(64) NOT NULL
    COMMENT 'e.g. reward_regulation, life_balance',
  assessment_id BIGINT UNSIGNED NOT NULL
    COMMENT 'Row id in the family assessments/cycles table',
  kind ENUM('result', 'plan') NOT NULL,
  title VARCHAR(255) NOT NULL,
  html_body MEDIUMTEXT NOT NULL,
  plain_summary TEXT NULL,
  scores_snapshot_json JSON NULL,
  shared_with_client TINYINT(1) NOT NULL DEFAULT 0,
  shared_at DATETIME NULL,
  shared_by_user_id INT NULL,
  google_doc_id VARCHAR(128) NULL,
  google_doc_url VARCHAR(512) NULL,
  storage_path VARCHAR(512) NULL
    COMMENT 'Optional replaced binary path',
  storage_mime VARCHAR(128) NULL,
  version INT NOT NULL DEFAULT 1,
  created_by_user_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_cad_family_assessment_kind (assessment_family, assessment_id, kind),
  KEY idx_cad_client (client_id),
  KEY idx_cad_agency (agency_id),
  KEY idx_cad_client_shared (client_id, shared_with_client),
  KEY idx_cad_family (assessment_family),
  CONSTRAINT fk_cad_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  CONSTRAINT fk_cad_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Couples assessments: attach client when assigned from CRM
ALTER TABLE marriage_alignment_cycles
  ADD COLUMN client_id INT NULL DEFAULT NULL
    COMMENT 'CRM client when cycle assigned from coach tools'
    AFTER agency_id,
  ADD KEY idx_ma_cycle_client (client_id);

ALTER TABLE relationship_assessment_cycles
  ADD COLUMN client_id INT NULL DEFAULT NULL
    COMMENT 'CRM client when cycle assigned from coach tools'
    AFTER agency_id,
  ADD KEY idx_rh_cycle_client (client_id);
