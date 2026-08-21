-- Migration 1266: Provider Update (modular pushes) + Workplace Handbook

CREATE TABLE IF NOT EXISTS provider_update_pushes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  title VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Provider Update',
  status ENUM('draft', 'sent', 'closed') NOT NULL DEFAULT 'draft',
  section_config_json JSON NULL COMMENT 'Map of section_key -> enabled bool',
  notes TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  created_by_user_id INT NULL DEFAULT NULL,
  sent_at DATETIME NULL DEFAULT NULL,
  sent_by_user_id INT NULL DEFAULT NULL,
  closed_at DATETIME NULL DEFAULT NULL,
  payroll_submitted_at DATETIME NULL DEFAULT NULL,
  payroll_submitted_by_user_id INT NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_pu_pushes_agency_status (agency_id, status),
  INDEX idx_pu_pushes_sent (agency_id, sent_at),
  CONSTRAINT fk_pu_pushes_agency
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_pu_pushes_created_by
    FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_pu_pushes_sent_by
    FOREIGN KEY (sent_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_pu_pushes_payroll_by
    FOREIGN KEY (payroll_submitted_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS provider_update_recipients (
  id INT AUTO_INCREMENT PRIMARY KEY,
  push_id INT NOT NULL,
  agency_id INT NOT NULL,
  provider_user_id INT NOT NULL,
  token VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  status ENUM('not_started', 'in_progress', 'finalized') NOT NULL DEFAULT 'not_started',
  expires_at DATETIME NOT NULL,
  locked_at DATETIME NULL DEFAULT NULL,
  click_count INT NOT NULL DEFAULT 0,
  last_viewed_at DATETIME NULL DEFAULT NULL,
  active_seconds INT NOT NULL DEFAULT 0,
  last_heartbeat_at DATETIME NULL DEFAULT NULL,
  finalized_at DATETIME NULL DEFAULT NULL,
  finalized_by_actor_type ENUM('provider', 'admin', 'token_guest') NULL DEFAULT NULL,
  finalized_by_user_id INT NULL DEFAULT NULL,
  snapshot_json JSON NULL,
  payroll_time_claim_id INT NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_pu_recipient_token (token),
  UNIQUE KEY uq_pu_recipient_push_provider (push_id, provider_user_id),
  INDEX idx_pu_recipients_agency (agency_id, status),
  INDEX idx_pu_recipients_provider (provider_user_id),
  CONSTRAINT fk_pu_recipients_push
    FOREIGN KEY (push_id) REFERENCES provider_update_pushes(id) ON DELETE CASCADE,
  CONSTRAINT fk_pu_recipients_agency
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_pu_recipients_provider
    FOREIGN KEY (provider_user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_pu_recipients_finalized_by
    FOREIGN KEY (finalized_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS provider_update_section_progress (
  id INT AUTO_INCREMENT PRIMARY KEY,
  recipient_id INT NOT NULL,
  section_key VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  mode ENUM('set', 'confirm', 'update', 'link', 'ack') NULL DEFAULT NULL,
  status ENUM('not_started', 'in_progress', 'completed') NOT NULL DEFAULT 'not_started',
  completed TINYINT(1) NOT NULL DEFAULT 0,
  completed_at DATETIME NULL DEFAULT NULL,
  data_json JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_pu_section (recipient_id, section_key),
  CONSTRAINT fk_pu_section_recipient
    FOREIGN KEY (recipient_id) REFERENCES provider_update_recipients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS provider_update_view_events (
  id INT AUTO_INCREMENT PRIMARY KEY,
  recipient_id INT NOT NULL,
  event_type VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  section_key VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  metadata_json JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_pu_views_recipient (recipient_id, created_at),
  CONSTRAINT fk_pu_views_recipient
    FOREIGN KEY (recipient_id) REFERENCES provider_update_recipients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS provider_update_sends (
  id INT AUTO_INCREMENT PRIMARY KEY,
  push_id INT NOT NULL,
  recipient_id INT NULL DEFAULT NULL,
  provider_user_id INT NULL DEFAULT NULL,
  to_email VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  subject VARCHAR(512) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  delivery_status VARCHAR(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  error_message VARCHAR(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  external_message_id VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  communication_id INT NULL DEFAULT NULL,
  sent_at DATETIME NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_pu_sends_push (push_id),
  CONSTRAINT fk_pu_sends_push
    FOREIGN KEY (push_id) REFERENCES provider_update_pushes(id) ON DELETE CASCADE,
  CONSTRAINT fk_pu_sends_recipient
    FOREIGN KEY (recipient_id) REFERENCES provider_update_recipients(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS workplace_handbook_documents (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  title VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Workplace Handbook',
  published_version_id INT NULL DEFAULT NULL,
  draft_notes TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_wh_doc_agency (agency_id),
  CONSTRAINT fk_wh_doc_agency
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS workplace_handbook_versions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  document_id INT NOT NULL,
  agency_id INT NOT NULL,
  version_number INT NOT NULL,
  changelog TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  published_at DATETIME NULL DEFAULT NULL,
  published_by_user_id INT NULL DEFAULT NULL,
  is_draft TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_wh_version (document_id, version_number),
  INDEX idx_wh_versions_agency (agency_id, published_at),
  CONSTRAINT fk_wh_version_doc
    FOREIGN KEY (document_id) REFERENCES workplace_handbook_documents(id) ON DELETE CASCADE,
  CONSTRAINT fk_wh_version_agency
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_wh_version_published_by
    FOREIGN KEY (published_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS workplace_handbook_sections (
  id INT AUTO_INCREMENT PRIMARY KEY,
  version_id INT NOT NULL,
  agency_id INT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  slug VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  title VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  body_html MEDIUMTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_wh_section_slug (version_id, slug),
  INDEX idx_wh_sections_version (version_id, sort_order),
  CONSTRAINT fk_wh_section_version
    FOREIGN KEY (version_id) REFERENCES workplace_handbook_versions(id) ON DELETE CASCADE,
  CONSTRAINT fk_wh_section_agency
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS workplace_handbook_views (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  version_id INT NOT NULL,
  section_id INT NULL DEFAULT NULL,
  user_id INT NULL DEFAULT NULL,
  provider_update_recipient_id INT NULL DEFAULT NULL,
  event_type ENUM('open', 'section_view', 'section_select', 'acknowledge') NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_wh_views_version (version_id, created_at),
  INDEX idx_wh_views_user (user_id, created_at),
  CONSTRAINT fk_wh_views_agency
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_wh_views_version
    FOREIGN KEY (version_id) REFERENCES workplace_handbook_versions(id) ON DELETE CASCADE,
  CONSTRAINT fk_wh_views_section
    FOREIGN KEY (section_id) REFERENCES workplace_handbook_sections(id) ON DELETE SET NULL,
  CONSTRAINT fk_wh_views_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS workplace_handbook_questions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  version_id INT NOT NULL,
  section_id INT NULL DEFAULT NULL,
  asked_by_user_id INT NULL DEFAULT NULL,
  provider_update_recipient_id INT NULL DEFAULT NULL,
  question_text TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  status ENUM('open', 'escalated', 'answered', 'closed') NOT NULL DEFAULT 'open',
  support_ticket_id INT NULL DEFAULT NULL,
  answered_at DATETIME NULL DEFAULT NULL,
  answered_by_user_id INT NULL DEFAULT NULL,
  answer_text TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_wh_questions_agency_status (agency_id, status),
  CONSTRAINT fk_wh_questions_agency
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_wh_questions_version
    FOREIGN KEY (version_id) REFERENCES workplace_handbook_versions(id) ON DELETE CASCADE,
  CONSTRAINT fk_wh_questions_section
    FOREIGN KEY (section_id) REFERENCES workplace_handbook_sections(id) ON DELETE SET NULL,
  CONSTRAINT fk_wh_questions_asker
    FOREIGN KEY (asked_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
