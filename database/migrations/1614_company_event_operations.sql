-- Keep fees owed by the company separate from program fees charged to attendees.
ALTER TABLE company_events ADD COLUMN operations_json JSON NULL;
ALTER TABLE company_events ADD COLUMN staff_link_token VARCHAR(64) NULL;

-- Preserve intentionally published registration pages; internal events stay internal.
UPDATE company_events SET operations_json = COALESCE(operations_json, JSON_OBJECT(
  'publicRegistrationEnabled', IF(registration_eligible = 1 OR rsvp_mode = 'registration', TRUE, FALSE)
)), staff_link_token = COALESCE(staff_link_token, LOWER(HEX(RANDOM_BYTES(24))));

ALTER TABLE company_events ADD UNIQUE KEY uq_company_event_staff_link (staff_link_token);

CREATE TABLE IF NOT EXISTS company_event_coordinators (
  company_event_id INT NOT NULL,
  user_id INT NOT NULL,
  assigned_by_user_id INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (company_event_id, user_id),
  INDEX idx_event_coordinator_user (user_id),
  FOREIGN KEY (company_event_id) REFERENCES company_events(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE company_event_guest_registrations ADD COLUMN management_token_hash CHAR(64) NULL;
ALTER TABLE company_event_guest_registrations ADD COLUMN sms_consent_json JSON NULL;
ALTER TABLE company_event_guest_registrations ADD COLUMN checked_in_at DATETIME NULL;
ALTER TABLE company_event_guest_registrations ADD COLUMN checked_out_at DATETIME NULL;

-- Guest attendance is separate from employee payroll and clinical attendance.
CREATE TABLE IF NOT EXISTS company_event_guest_attendance (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  company_event_id INT NOT NULL,
  guest_registration_id INT NOT NULL,
  attendance_date DATE NOT NULL,
  checked_in_at DATETIME NOT NULL,
  checked_out_at DATETIME NULL,
  UNIQUE KEY uq_event_guest_attendance_day (guest_registration_id, attendance_date),
  KEY idx_event_guest_attendance_event (company_event_id, attendance_date),
  FOREIGN KEY (company_event_id) REFERENCES company_events(id) ON DELETE CASCADE,
  FOREIGN KEY (guest_registration_id) REFERENCES company_event_guest_registrations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
