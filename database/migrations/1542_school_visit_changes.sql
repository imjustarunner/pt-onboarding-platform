ALTER TABLE school_reinit_checkin_bookings
  ADD COLUMN visit_revision INT NOT NULL DEFAULT 1,
  ADD COLUMN calendar_sync_status VARCHAR(24) NOT NULL DEFAULT 'ready',
  ADD COLUMN calendar_sync_error VARCHAR(500) NULL;

CREATE TABLE IF NOT EXISTS school_visit_changes (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  booking_id INT NOT NULL,
  revision INT NOT NULL,
  action VARCHAR(32) NOT NULL,
  before_json JSON NOT NULL,
  after_json JSON NOT NULL,
  actor_user_id INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_school_visit_change (booking_id, revision)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
