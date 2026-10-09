-- Durable cleanup crosses the scheduling and clinical databases. No historical
-- bookings are modified by this migration; jobs are created on termination.
ALTER TABLE office_standing_assignments
  ADD COLUMN client_booking_released_at DATETIME NULL,
  ADD COLUMN legacy_monthly_four_weeks TINYINT(1) NOT NULL DEFAULT 0;
CREATE TABLE client_schedule_termination_jobs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  client_id INT NOT NULL,
  actor_user_id INT NULL,
  cutoff_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME NULL,
  attempts INT NOT NULL DEFAULT 0,
  last_error_code VARCHAR(100) NULL,
  KEY pending_termination (completed_at, id),
  KEY client_pending_termination (client_id, completed_at)
) ENGINE=InnoDB;
CREATE TABLE client_schedule_termination_items (
  job_id BIGINT UNSIGNED NOT NULL,
  appointment_id INT UNSIGNED NOT NULL,
  snapshot_json JSON NOT NULL,
  completed_at DATETIME NULL,
  PRIMARY KEY (job_id, appointment_id),
  FOREIGN KEY (job_id) REFERENCES client_schedule_termination_jobs(id)
) ENGINE=InnoDB;
-- Existing MONTHLY office rows historically meant every four weeks. Preserve
-- their promised dates; newly created MONTHLY plans use calendar months.
-- Keep the standing row's unique frequency key intact, including inactive history.
UPDATE office_standing_assignments SET legacy_monthly_four_weeks=1 WHERE assigned_frequency='MONTHLY';
UPDATE office_booking_plans SET booked_frequency='EVERY_4_WEEKS' WHERE booked_frequency='MONTHLY';
