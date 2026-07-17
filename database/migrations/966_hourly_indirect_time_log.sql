-- Migration 966: Hourly employee indirect time log
-- Admin-managed service types + open clock sessions for payroll time claims (claim_type = indirect_time).

CREATE TABLE payroll_indirect_service_types (
  id INT NOT NULL AUTO_INCREMENT,
  agency_id INT NOT NULL,
  type_key VARCHAR(64) NOT NULL COMMENT 'Stable slug, unique per agency',
  label VARCHAR(128) NOT NULL,
  description VARCHAR(255) NULL,
  icon_key VARCHAR(64) NOT NULL DEFAULT 'circle' COMMENT 'Frontend icon map key',
  sort_order INT NOT NULL DEFAULT 0,
  is_active TINYINT NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_indirect_type_agency_key (agency_id, type_key),
  KEY idx_indirect_type_agency_active (agency_id, is_active, sort_order),
  CONSTRAINT fk_indirect_type_agency
    FOREIGN KEY (agency_id) REFERENCES agencies (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE payroll_indirect_time_sessions (
  id INT NOT NULL AUTO_INCREMENT,
  agency_id INT NOT NULL,
  user_id INT NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'open' COMMENT 'open|on_break|closed',
  clocked_in_at DATETIME NOT NULL,
  break_started_at DATETIME NULL,
  break_seconds_total INT NOT NULL DEFAULT 0,
  clocked_out_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_indirect_session_user_status (agency_id, user_id, status),
  KEY idx_indirect_session_open (user_id, status),
  CONSTRAINT fk_indirect_session_agency
    FOREIGN KEY (agency_id) REFERENCES agencies (id) ON DELETE CASCADE,
  CONSTRAINT fk_indirect_session_user
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
