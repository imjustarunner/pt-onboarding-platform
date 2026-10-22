-- Reviewed recipients share a schedule update but have separate delivery receipts.
ALTER TABLE appointment_schedule_notice_deliveries
  ADD COLUMN recipient_key VARCHAR(100) NOT NULL DEFAULT 'default',
  DROP INDEX uq_schedule_notice_delivery,
  ADD UNIQUE KEY uq_schedule_notice_recipient (batch_id,channel,recipient_key);

CREATE TABLE IF NOT EXISTS cancellation_school_deliveries (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  review_token CHAR(36) NOT NULL,
  item_key VARCHAR(100) NOT NULL,
  recipient_address VARCHAR(320) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'pending',
  error_message VARCHAR(500) NULL,
  sent_at DATETIME NULL,
  communication_id INT NULL,
  UNIQUE KEY uq_cancellation_school_recipient (review_token,item_key,recipient_address)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS appointment_replacement_offer_views (
  offer_id BIGINT UNSIGNED NOT NULL,
  user_id INT NOT NULL,
  first_viewed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_viewed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (offer_id,user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS appointment_replacement_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  offer_id BIGINT UNSIGNED NOT NULL,
  event_type VARCHAR(40) NOT NULL,
  outcome_text TEXT NOT NULL,
  note_recorded_at DATETIME NULL,
  email_status VARCHAR(24) NOT NULL DEFAULT 'pending',
  email_error VARCHAR(500) NULL,
  email_sent_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_replacement_outcome (offer_id,event_type),
  KEY idx_replacement_events_pending (email_status,note_recorded_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
