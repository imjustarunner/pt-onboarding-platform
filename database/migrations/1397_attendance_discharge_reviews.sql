-- Migration 1397: Third-strike attendance discharge / continued-scheduling review queue
-- Strike 3 never auto-terminates; this table tracks admin/clinical review of the recommendation.

CREATE TABLE IF NOT EXISTS client_attendance_discharge_reviews (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  agency_id INT NOT NULL,
  client_id INT NOT NULL,
  strike_id INT UNSIGNED NOT NULL,
  appointment_id INT UNSIGNED NULL DEFAULT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'pending_review'
    COMMENT 'pending_review|continue_scheduling|proceed_to_termination|dismissed',
  provider_recommended_waive TINYINT(1) NOT NULL DEFAULT 0,
  provider_waive_reason VARCHAR(255) NULL DEFAULT NULL,
  review_decision_reason VARCHAR(255) NULL DEFAULT NULL,
  review_comment TEXT NULL,
  reviewed_by_user_id INT NULL DEFAULT NULL,
  reviewed_at DATETIME NULL DEFAULT NULL,
  task_id INT NULL DEFAULT NULL,
  created_by_user_id INT NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_discharge_review_strike (strike_id),
  KEY idx_discharge_review_agency_status (agency_id, status),
  KEY idx_discharge_review_client (client_id),
  CONSTRAINT fk_discharge_review_agency
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_discharge_review_client
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  CONSTRAINT fk_discharge_review_strike
    FOREIGN KEY (strike_id) REFERENCES client_medicaid_attendance_strikes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
