-- Pre-EHR school occurrences remain schedule evidence, not fabricated encounters.
CREATE TABLE IF NOT EXISTS school_day_absence_history (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  provider_id INT NOT NULL,
  client_id INT NOT NULL,
  school_id INT NOT NULL,
  absence_date DATE NOT NULL,
  review_token CHAR(36) NOT NULL,
  actor_user_id INT NOT NULL,
  reason_category VARCHAR(40) NOT NULL,
  urgent TINYINT(1) NOT NULL DEFAULT 1,
  snapshot_payload MEDIUMTEXT NOT NULL,
  delivery_payload MEDIUMTEXT NULL,
  recorded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_school_absence_occurrence (agency_id,provider_id,client_id,school_id,absence_date),
  KEY idx_school_absence_chart (agency_id,client_id,absence_date),
  KEY idx_school_absence_provider (provider_id,agency_id,absence_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE planned_outs ADD COLUMN cancellation_review_token CHAR(36) NULL;

ALTER TABLE cancellation_school_deliveries
  ADD COLUMN external_message_id VARCHAR(255) NULL,
  ADD COLUMN actual_recipient_address VARCHAR(320) NULL;
