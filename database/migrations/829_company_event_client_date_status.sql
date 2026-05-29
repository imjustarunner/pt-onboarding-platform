-- Migration 829: per-date attendance status for event participants
--
-- Lets support/staff set a forward-looking attendance status for a client on a
-- specific session date from the event portal, which the day kiosk then reads
-- so staff know what to expect:
--   * planned_absence — client will not attend this one date
--   * late            — client will arrive late (expected_arrival_time)
--   * removed         — client is not returning to the group from this date on
--
-- One row per client per session date. "Remove from future dates" writes a
-- removed row for the selected date and every later session date; clearing it
-- deletes those rows. Reversible.
--
-- FK columns are signed INT to match company_events.id, clients.id, agencies.id
-- (and users.id), otherwise MySQL rejects the constraints as incompatible.

CREATE TABLE IF NOT EXISTS company_event_client_date_status (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  company_event_id INT NOT NULL,
  agency_id INT NOT NULL,
  client_id INT NOT NULL,
  session_date DATE NOT NULL COMMENT 'The calendar date this status applies to',
  status ENUM('planned_absence', 'late', 'removed') NOT NULL,
  expected_arrival_time VARCHAR(20) NULL DEFAULT NULL
    COMMENT 'Wall-clock expected arrival for late status (e.g. 9:30 AM)',
  note VARCHAR(500) NULL DEFAULT NULL
    COMMENT 'Free-text note shown on the kiosk for attendance/safety',
  set_by_user_id INT NULL DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY uq_cecds_event_client_date (company_event_id, client_id, session_date),
  KEY idx_cecds_event_date (company_event_id, session_date),
  KEY idx_cecds_client (client_id),

  CONSTRAINT fk_cecds_event FOREIGN KEY (company_event_id) REFERENCES company_events(id) ON DELETE CASCADE,
  CONSTRAINT fk_cecds_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  CONSTRAINT fk_cecds_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_cecds_user FOREIGN KEY (set_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
