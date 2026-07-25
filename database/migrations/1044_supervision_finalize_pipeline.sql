-- Migration 1044: supervision finalize pipeline (hour credits + supervisor claim link)

CREATE TABLE IF NOT EXISTS supervision_session_hour_credits (
  id INT NOT NULL AUTO_INCREMENT,
  agency_id INT NOT NULL,
  session_id INT NOT NULL,
  user_id INT NOT NULL,
  individual_hours DECIMAL(12,2) NOT NULL DEFAULT 0,
  group_hours DECIMAL(12,2) NOT NULL DEFAULT 0,
  total_seconds INT NOT NULL DEFAULT 0,
  session_type VARCHAR(32) NULL,
  source_json JSON NULL,
  created_by_user_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_supervision_session_user_credit (session_id, user_id),
  INDEX idx_supervision_session_credits_user (agency_id, user_id),
  CONSTRAINT fk_sshc_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_sshc_session FOREIGN KEY (session_id) REFERENCES supervision_sessions(id) ON DELETE CASCADE,
  CONSTRAINT fk_sshc_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_sshc_created_by FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE supervision_sessions
  ADD COLUMN supervisor_time_claim_id INT NULL DEFAULT NULL
  COMMENT 'payroll_time_claims.id created on finalize for supervisor Supervision time';

CREATE INDEX idx_supervision_sessions_supervisor_claim
  ON supervision_sessions (supervisor_time_claim_id);
