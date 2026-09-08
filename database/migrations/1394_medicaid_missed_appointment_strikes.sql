-- Migration 1394: Medicaid missed-appointment strike policy + ledger

ALTER TABLE agencies
  ADD COLUMN medicaid_strike_policy_enabled TINYINT(1) NOT NULL DEFAULT 0
  COMMENT 'When 1, qualifying Medicaid late cancels and no-shows create rolling 365-day strikes';

CREATE TABLE IF NOT EXISTS client_medicaid_attendance_strikes (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  agency_id INT NOT NULL,
  client_id INT NOT NULL,
  appointment_id INT UNSIGNED NULL DEFAULT NULL,
  struck_at DATETIME NOT NULL,
  expires_at DATETIME NOT NULL COMMENT 'struck_at plus 365 days',
  event_kind VARCHAR(32) NOT NULL COMMENT 'late_cancel or no_show',
  termination_recommendation TINYINT(1) NOT NULL DEFAULT 0
    COMMENT '1 when this is the third active strike (review recommended, not auto-terminate)',
  termination_recommendation_waived TINYINT(1) NOT NULL DEFAULT 0,
  termination_waiver_reason VARCHAR(255) NULL DEFAULT NULL,
  termination_waiver_comment TEXT NULL,
  termination_waived_by_user_id INT NULL DEFAULT NULL,
  termination_waived_at DATETIME NULL DEFAULT NULL,
  created_by_user_id INT NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_medicaid_strikes_client_active (agency_id, client_id, expires_at),
  KEY idx_medicaid_strikes_appointment (appointment_id),
  CONSTRAINT fk_medicaid_strikes_agency
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_medicaid_strikes_client
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
