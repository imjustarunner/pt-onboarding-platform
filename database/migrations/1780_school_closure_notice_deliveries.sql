-- One internal Schools-team notice and one per assigned provider, district/day/phase.
-- Claims precede transport. Ambiguous sends are retained for receipt review.
CREATE TABLE IF NOT EXISTS school_closure_notice_deliveries (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  delivery_key VARCHAR(512) NOT NULL,
  closure_date DATE NOT NULL,
  phase ENUM('advance','morning') NOT NULL,
  audience ENUM('team','provider') NOT NULL,
  user_id INT NULL,
  recipient_email VARCHAR(255) NOT NULL,
  message_id VARCHAR(255) NOT NULL,
  source_event_ids_json JSON NOT NULL,
  status ENUM('sending','sent','skipped','held') NOT NULL,
  communication_id INT NULL,
  sent_at TIMESTAMP NULL,
  last_error VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_school_closure_delivery (agency_id,delivery_key),
  KEY ix_school_closure_date (agency_id,closure_date,status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
