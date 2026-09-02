-- Migration 1357: Per-tenant Note Aid catalog settings + people assignments + custom aids
-- Mirrors payroll indirect activity assignment pattern (catalog + user junction).

CREATE TABLE IF NOT EXISTS note_aid_agency_aid_settings (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  catalog_aid_id VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Id from NOTE_AID_CATEGORIES (e.g. code_decider, pcp_note)',
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  title_override VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  attachable_to_session TINYINT(1) NULL DEFAULT NULL COMMENT 'NULL = use catalog default',
  attachable_to_claim TINYINT(1) NULL DEFAULT NULL COMMENT 'NULL = use catalog default',
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_note_aid_agency_catalog (agency_id, catalog_aid_id),
  KEY idx_note_aid_agency_settings_agency (agency_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS note_aid_custom_aids (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  title VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  guidance TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  system_prompt MEDIUMTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL COMMENT 'Training / gem instructions',
  training_notes MEDIUMTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  base_tool_id VARCHAR(96) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL COMMENT 'Optional CLINICAL_NOTE_AGENT_TOOLS id to inherit',
  service_code VARCHAR(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  attachable_to_session TINYINT(1) NOT NULL DEFAULT 0,
  attachable_to_claim TINYINT(1) NOT NULL DEFAULT 0,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  created_by_user_id INT NULL DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_note_aid_custom_agency (agency_id, enabled)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS note_aid_aid_user_assignments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  catalog_aid_id VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL COMMENT 'Built-in aid id when set',
  custom_aid_id BIGINT UNSIGNED NULL DEFAULT NULL COMMENT 'Custom aid when set',
  user_id INT NOT NULL,
  is_enabled TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_note_aid_user_catalog (agency_id, catalog_aid_id, user_id),
  UNIQUE KEY uq_note_aid_user_custom (agency_id, custom_aid_id, user_id),
  KEY idx_note_aid_assign_user (agency_id, user_id),
  CONSTRAINT fk_note_aid_assign_custom
    FOREIGN KEY (custom_aid_id) REFERENCES note_aid_custom_aids (id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Questionnaire attachment tracking on clinical notes (main DB mirror of clinical note id)
CREATE TABLE IF NOT EXISTS note_aid_questionnaire_attachments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  client_id INT NOT NULL,
  clinical_note_id BIGINT NOT NULL COMMENT 'clinical_notes.id in clinical DB',
  instrument_key VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'e.g. phq9, gad7, psc17',
  source_ref VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL COMMENT 'intake_submission_id or artifact key',
  score_summary TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  attached_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  attached_by_user_id INT NULL DEFAULT NULL,
  UNIQUE KEY uq_note_aid_q_attach_note_inst (clinical_note_id, instrument_key, source_ref),
  KEY idx_note_aid_q_client (agency_id, client_id, instrument_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Default: PCP disabled for all agencies that already use Note Aid (seed on first settings load).
INSERT INTO note_aid_agency_aid_settings (agency_id, catalog_aid_id, enabled, attachable_to_session, attachable_to_claim)
SELECT a.id, 'pcp_note', 0, 0, 0
FROM agencies a
WHERE NOT EXISTS (
  SELECT 1 FROM note_aid_agency_aid_settings s
  WHERE s.agency_id = a.id AND s.catalog_aid_id = 'pcp_note'
);
