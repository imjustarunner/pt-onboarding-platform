-- Migration 615: Event-day kiosk check-in/check-out tracking
-- Tracks client and employee arrivals/departures for a company event day.
-- Separate from skill_builders_event_kiosk_punches (time-clock) -- this is
-- attendance/roster management, not payroll.

CREATE TABLE IF NOT EXISTS event_day_kiosk_checkins (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  company_event_id INT NOT NULL,
  agency_id INT NOT NULL,
  -- Who: either a client OR a staff user (one column will be NULL)
  client_id INT NULL,
  user_id INT NULL,
  person_type ENUM('client','employee') NOT NULL,
  -- Phase: check_in or check_out
  action ENUM('check_in','check_out') NOT NULL,
  checked_in_at TIMESTAMP NULL DEFAULT NULL,
  checked_out_at TIMESTAMP NULL DEFAULT NULL,
  -- Device/context
  kiosk_date DATE NOT NULL COMMENT 'The calendar date of the event session',
  ip_address VARCHAR(64) NULL,
  -- Audit
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_edkc_event (company_event_id, kiosk_date),
  INDEX idx_edkc_client (client_id),
  INDEX idx_edkc_user (user_id),
  INDEX idx_edkc_agency (agency_id),
  CONSTRAINT fk_edkc_event FOREIGN KEY (company_event_id) REFERENCES company_events(id) ON DELETE CASCADE,
  CONSTRAINT fk_edkc_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL,
  CONSTRAINT fk_edkc_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
