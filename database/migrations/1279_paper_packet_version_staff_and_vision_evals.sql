-- Migration 1279: paper packet version staff snapshot + Vision evaluation audit
-- staff_json: who was printed on that version (SoT for auto ROI grants)
-- client_paper_packet_vision_evals: Vision results from signed upload (version, signatures, DENY)

ALTER TABLE school_packet_org_versions
  ADD COLUMN staff_json MEDIUMTEXT NULL DEFAULT NULL
  COMMENT 'JSON array of school staff printed on this version (id, name, role)'
  AFTER providers_json;

CREATE TABLE IF NOT EXISTS client_paper_packet_vision_evals (
  id INT AUTO_INCREMENT PRIMARY KEY,
  client_id INT NOT NULL,
  school_organization_id INT NOT NULL,
  phi_document_id INT NULL DEFAULT NULL,
  storage_path VARCHAR(512) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  detected_version_label VARCHAR(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  matched_version_id INT NULL DEFAULT NULL,
  confidence DECIMAL(5,4) NULL DEFAULT NULL
    COMMENT '0-1 overall confidence for auto-apply',
  roi_signature_detected TINYINT(1) NOT NULL DEFAULT 0,
  disclosure_signature_detected TINYINT(1) NOT NULL DEFAULT 0,
  deny_staff_user_ids_json MEDIUMTEXT NULL DEFAULT NULL
    COMMENT 'JSON array of school_staff_user_id with DENY checked',
  review_reasons_json MEDIUMTEXT NULL DEFAULT NULL
    COMMENT 'JSON array of human-readable review reasons',
  raw_vision_summary_json MEDIUMTEXT NULL DEFAULT NULL,
  status VARCHAR(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending'
    COMMENT 'pending | applied | needs_review | failed',
  applied_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_cppve_client (client_id, created_at),
  KEY idx_cppve_school_status (school_organization_id, status),
  KEY idx_cppve_phi (phi_document_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
