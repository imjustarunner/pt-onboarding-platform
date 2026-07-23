-- Migration 1032: Collaborative School Fall Re-Initiation Workflow

CREATE TABLE IF NOT EXISTS school_reinit_cycles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  school_organization_id INT NOT NULL,
  school_year VARCHAR(16) NOT NULL COMMENT 'e.g. 2026-27',
  status ENUM('not_started', 'in_progress', 'finalized') NOT NULL DEFAULT 'not_started',
  finalized_at DATETIME NULL DEFAULT NULL,
  finalized_by_actor_type ENUM('token_guest', 'school_staff', 'admin') NULL DEFAULT NULL,
  finalized_by_user_id INT NULL DEFAULT NULL,
  finalized_by_display_name VARCHAR(255) NULL DEFAULT NULL,
  snapshot_json JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_school_reinit_cycle (agency_id, school_organization_id, school_year),
  INDEX idx_school_reinit_cycles_agency_year (agency_id, school_year),
  INDEX idx_school_reinit_cycles_school (school_organization_id, school_year),
  CONSTRAINT fk_school_reinit_cycles_agency
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_school_reinit_cycles_school
    FOREIGN KEY (school_organization_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_school_reinit_cycles_finalized_by
    FOREIGN KEY (finalized_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS school_reinit_tokens (
  id INT AUTO_INCREMENT PRIMARY KEY,
  token VARCHAR(64) NOT NULL,
  cycle_id INT NOT NULL,
  agency_id INT NOT NULL,
  school_organization_id INT NOT NULL,
  created_by_user_id INT NULL DEFAULT NULL,
  expires_at DATETIME NOT NULL,
  marked_sent_at DATETIME NULL DEFAULT NULL,
  marked_sent_by_user_id INT NULL DEFAULT NULL,
  locked_at DATETIME NULL DEFAULT NULL,
  click_count INT NOT NULL DEFAULT 0,
  last_viewed_at DATETIME NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_school_reinit_token (token),
  INDEX idx_school_reinit_tokens_cycle (cycle_id),
  INDEX idx_school_reinit_tokens_agency (agency_id, school_organization_id),
  CONSTRAINT fk_school_reinit_tokens_cycle
    FOREIGN KEY (cycle_id) REFERENCES school_reinit_cycles(id) ON DELETE CASCADE,
  CONSTRAINT fk_school_reinit_tokens_agency
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_school_reinit_tokens_school
    FOREIGN KEY (school_organization_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_school_reinit_tokens_created_by
    FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_school_reinit_tokens_marked_by
    FOREIGN KEY (marked_sent_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS school_reinit_section_progress (
  id INT AUTO_INCREMENT PRIMARY KEY,
  cycle_id INT NOT NULL,
  section_key VARCHAR(64) NOT NULL,
  reviewed TINYINT(1) NOT NULL DEFAULT 0,
  reviewed_at DATETIME NULL DEFAULT NULL,
  reviewed_by_actor_type ENUM('token_guest', 'school_staff', 'admin') NULL DEFAULT NULL,
  reviewed_by_user_id INT NULL DEFAULT NULL,
  reviewed_by_display_name VARCHAR(255) NULL DEFAULT NULL,
  completed TINYINT(1) NOT NULL DEFAULT 0,
  data_json JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_school_reinit_section (cycle_id, section_key),
  CONSTRAINT fk_school_reinit_section_cycle
    FOREIGN KEY (cycle_id) REFERENCES school_reinit_cycles(id) ON DELETE CASCADE,
  CONSTRAINT fk_school_reinit_section_reviewed_by
    FOREIGN KEY (reviewed_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS school_reinit_question_configs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  school_year VARCHAR(16) NOT NULL,
  question_key VARCHAR(64) NOT NULL,
  section_key VARCHAR(64) NOT NULL,
  label VARCHAR(500) NOT NULL,
  help_text VARCHAR(1000) NULL DEFAULT NULL,
  input_type VARCHAR(32) NOT NULL DEFAULT 'text'
    COMMENT 'text|textarea|boolean|number|select|multiselect',
  options_json JSON NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  required TINYINT(1) NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_school_reinit_qcfg (agency_id, school_year, question_key),
  INDEX idx_school_reinit_qcfg_section (agency_id, school_year, section_key),
  CONSTRAINT fk_school_reinit_qcfg_agency
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS school_reinit_change_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  cycle_id INT NOT NULL,
  entity_type VARCHAR(64) NOT NULL COMMENT 'provider_assignment|school_staff',
  entity_id INT NULL DEFAULT NULL,
  action ENUM('modify', 'delete') NOT NULL,
  status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
  before_json JSON NULL,
  after_json JSON NULL,
  submitted_by_actor_type ENUM('token_guest', 'school_staff', 'admin') NULL DEFAULT NULL,
  submitted_by_user_id INT NULL DEFAULT NULL,
  submitted_by_display_name VARCHAR(255) NULL DEFAULT NULL,
  resolved_by_user_id INT NULL DEFAULT NULL,
  resolved_at DATETIME NULL DEFAULT NULL,
  resolution_note VARCHAR(500) NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_school_reinit_cr_cycle_status (cycle_id, status),
  CONSTRAINT fk_school_reinit_cr_cycle
    FOREIGN KEY (cycle_id) REFERENCES school_reinit_cycles(id) ON DELETE CASCADE,
  CONSTRAINT fk_school_reinit_cr_submitted_by
    FOREIGN KEY (submitted_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_school_reinit_cr_resolved_by
    FOREIGN KEY (resolved_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS school_reinit_addendums (
  id INT AUTO_INCREMENT PRIMARY KEY,
  cycle_id INT NOT NULL,
  summary_text VARCHAR(1000) NOT NULL,
  changes_json JSON NOT NULL,
  submitted_by_actor_type ENUM('token_guest', 'school_staff', 'admin') NULL DEFAULT NULL,
  submitted_by_user_id INT NULL DEFAULT NULL,
  submitted_by_display_name VARCHAR(255) NULL DEFAULT NULL,
  submitted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_school_reinit_addendum_cycle
    FOREIGN KEY (cycle_id) REFERENCES school_reinit_cycles(id) ON DELETE CASCADE,
  CONSTRAINT fk_school_reinit_addendum_user
    FOREIGN KEY (submitted_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS school_reinit_view_events (
  id INT AUTO_INCREMENT PRIMARY KEY,
  cycle_id INT NOT NULL,
  token_id INT NULL DEFAULT NULL,
  user_id INT NULL DEFAULT NULL,
  actor_display_name VARCHAR(255) NULL DEFAULT NULL,
  section_key VARCHAR(64) NULL DEFAULT NULL,
  event_type VARCHAR(32) NOT NULL DEFAULT 'view'
    COMMENT 'view|token_click|section_open',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_school_reinit_views_cycle (cycle_id, created_at),
  CONSTRAINT fk_school_reinit_views_cycle
    FOREIGN KEY (cycle_id) REFERENCES school_reinit_cycles(id) ON DELETE CASCADE,
  CONSTRAINT fk_school_reinit_views_token
    FOREIGN KEY (token_id) REFERENCES school_reinit_tokens(id) ON DELETE SET NULL,
  CONSTRAINT fk_school_reinit_views_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS school_reinit_dismissals (
  id INT AUTO_INCREMENT PRIMARY KEY,
  cycle_id INT NOT NULL,
  user_id INT NOT NULL,
  dismissed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  dismiss_until DATETIME NULL DEFAULT NULL,
  UNIQUE KEY uq_school_reinit_dismiss (cycle_id, user_id),
  CONSTRAINT fk_school_reinit_dismiss_cycle
    FOREIGN KEY (cycle_id) REFERENCES school_reinit_cycles(id) ON DELETE CASCADE,
  CONSTRAINT fk_school_reinit_dismiss_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS school_reinit_checkin_slots (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  school_year VARCHAR(16) NOT NULL,
  starts_at DATETIME NOT NULL,
  ends_at DATETIME NULL DEFAULT NULL,
  label VARCHAR(255) NULL DEFAULT NULL,
  capacity INT NOT NULL DEFAULT 20,
  booked_count INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_school_reinit_slots (agency_id, school_year, is_active),
  CONSTRAINT fk_school_reinit_slots_agency
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
