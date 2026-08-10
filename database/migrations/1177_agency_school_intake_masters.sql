-- Migration 1177: agency master school digital forms + live inheritance shells
-- One master EN/ES per agency; school intake_links can inherit steps/fields live.

CREATE TABLE IF NOT EXISTS agency_school_intake_masters (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  language_code VARCHAR(8) NOT NULL DEFAULT 'en',
  title VARCHAR(255) NULL,
  intake_steps JSON NULL,
  intake_fields JSON NULL,
  version INT NOT NULL DEFAULT 1,
  editor_intake_link_id INT NULL COMMENT 'Shadow intake_links row for Digital Forms editor',
  updated_by_user_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_agency_school_intake_master_lang (agency_id, language_code),
  KEY idx_agency_school_intake_masters_editor (editor_intake_link_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE intake_links
  ADD COLUMN inherits_school_master TINYINT(1) NOT NULL DEFAULT 0
    COMMENT 'When 1, public intake resolves steps/fields from agency_school_intake_masters'
    AFTER form_type;

ALTER TABLE intake_links
  ADD COLUMN is_school_master TINYINT(1) NOT NULL DEFAULT 0
    COMMENT 'When 1, this row is the editable shadow for an agency school digital form master'
    AFTER inherits_school_master;
