-- Persist claims before email delivery; ambiguous sends require review, not retries.
CREATE TABLE IF NOT EXISTS school_visit_reminders (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  booking_id INT NOT NULL,
  revision_hash CHAR(64) NOT NULL,
  recipient VARCHAR(320) NULL,
  delivery_status VARCHAR(24) NOT NULL DEFAULT 'pending',
  last_error VARCHAR(500) NULL,
  communication_id BIGINT NULL,
  sent_at DATETIME NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_school_visit_reminder (booking_id, revision_hash),
  INDEX idx_school_visit_reminder_review (delivery_status, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
