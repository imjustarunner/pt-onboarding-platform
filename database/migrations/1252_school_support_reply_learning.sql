-- Migration 1252: learn from staff AI draft edits (Phase 2)
ALTER TABLE support_tickets
  ADD COLUMN ai_draft_edit_summary VARCHAR(1000) NULL DEFAULT NULL
  COMMENT 'Short summary when staff edited the AI draft before sending';

CREATE TABLE school_support_reply_proposals (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  agency_id INT NOT NULL,
  school_organization_id INT NULL DEFAULT NULL,
  support_ticket_id INT NOT NULL,
  intent_key VARCHAR(64) NOT NULL DEFAULT 'general',
  title VARCHAR(255) NOT NULL,
  subject_template VARCHAR(500) NULL DEFAULT NULL,
  original_draft TEXT NULL,
  proposed_body TEXT NOT NULL,
  edit_summary VARCHAR(1000) NULL DEFAULT NULL,
  status ENUM('pending', 'approved', 'dismissed') NOT NULL DEFAULT 'pending',
  library_entry_id INT UNSIGNED NULL DEFAULT NULL,
  reviewed_by_user_id INT NULL DEFAULT NULL,
  reviewed_at TIMESTAMP NULL DEFAULT NULL,
  created_by_user_id INT NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_ssrp_agency_status (agency_id, status, created_at),
  KEY idx_ssrp_ticket (support_ticket_id),
  CONSTRAINT fk_ssrp_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_ssrp_school FOREIGN KEY (school_organization_id) REFERENCES agencies(id) ON DELETE SET NULL,
  CONSTRAINT fk_ssrp_ticket FOREIGN KEY (support_ticket_id) REFERENCES support_tickets(id) ON DELETE CASCADE,
  CONSTRAINT fk_ssrp_library FOREIGN KEY (library_entry_id) REFERENCES school_support_reply_library(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE support_ai_prompt_notes (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  agency_id INT NOT NULL,
  school_organization_id INT NULL DEFAULT NULL,
  source_ticket_id INT NULL DEFAULT NULL,
  note_type ENUM('reject_draft', 'edit_pattern', 'manual') NOT NULL DEFAULT 'manual',
  prompt_text VARCHAR(2000) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_by_user_id INT NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_sapn_agency_active (agency_id, is_active, created_at),
  CONSTRAINT fk_sapn_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_sapn_school FOREIGN KEY (school_organization_id) REFERENCES agencies(id) ON DELETE SET NULL,
  CONSTRAINT fk_sapn_ticket FOREIGN KEY (source_ticket_id) REFERENCES support_tickets(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
