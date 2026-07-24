-- Migration 1034: Fall check-in pre-slots, hosts/gaps, bookings, calendar linkage

ALTER TABLE school_reinit_campaigns
  ADD COLUMN host_user_ids JSON NULL DEFAULT NULL
    COMMENT 'Agency host user ids for fall check-in calendars',
  ADD COLUMN extra_attendee_user_ids JSON NULL DEFAULT NULL
    COMMENT 'Optional additional agency presenters',
  ADD COLUMN slot_duration_minutes INT NOT NULL DEFAULT 30
    COMMENT 'Default check-in duration in minutes',
  ADD COLUMN in_person_gap_minutes INT NOT NULL DEFAULT 30
    COMMENT 'Travel/leeway gap between in-person bookings',
  ADD COLUMN virtual_gap_minutes INT NOT NULL DEFAULT 0
    COMMENT 'Gap between virtual bookings (0 allowed)',
  ADD COLUMN default_location_mode VARCHAR(32) NOT NULL DEFAULT 'school'
    COMMENT 'Default in-person location mode';

ALTER TABLE school_reinit_checkin_slots
  ADD COLUMN modality VARCHAR(32) NOT NULL DEFAULT 'in_person'
    COMMENT 'in_person or virtual',
  ADD COLUMN duration_minutes INT NULL DEFAULT NULL
    COMMENT 'Override campaign duration; null uses campaign default',
  ADD COLUMN status VARCHAR(32) NOT NULL DEFAULT 'open'
    COMMENT 'open, booked, or cancelled',
  ADD COLUMN booked_cycle_id INT NULL DEFAULT NULL,
  ADD COLUMN booked_school_agency_id INT NULL DEFAULT NULL,
  ADD COLUMN booked_at DATETIME NULL DEFAULT NULL,
  ADD COLUMN location_mode VARCHAR(32) NOT NULL DEFAULT 'school',
  ADD COLUMN location_note VARCHAR(500) NULL DEFAULT NULL,
  ADD COLUMN google_meet_link VARCHAR(1024) NULL DEFAULT NULL,
  ADD INDEX idx_school_reinit_slots_status (agency_id, school_year, modality, status),
  ADD CONSTRAINT fk_school_reinit_slots_booked_cycle
    FOREIGN KEY (booked_cycle_id) REFERENCES school_reinit_cycles(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_school_reinit_slots_booked_school
    FOREIGN KEY (booked_school_agency_id) REFERENCES agencies(id) ON DELETE SET NULL;

UPDATE school_reinit_checkin_slots
SET capacity = 1
WHERE capacity = 20;

CREATE TABLE IF NOT EXISTS school_reinit_checkin_slot_host_events (
  id INT AUTO_INCREMENT PRIMARY KEY,
  slot_id INT NOT NULL,
  host_user_id INT NOT NULL,
  provider_schedule_event_id INT NULL DEFAULT NULL,
  google_event_id VARCHAR(255) NULL DEFAULT NULL,
  google_html_link VARCHAR(1024) NULL DEFAULT NULL,
  google_meet_link VARCHAR(1024) NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_checkin_slot_host (slot_id, host_user_id),
  INDEX idx_checkin_slot_host_user (host_user_id),
  CONSTRAINT fk_checkin_slot_host_slot
    FOREIGN KEY (slot_id) REFERENCES school_reinit_checkin_slots(id) ON DELETE CASCADE,
  CONSTRAINT fk_checkin_slot_host_user
    FOREIGN KEY (host_user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS school_reinit_checkin_bookings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  cycle_id INT NOT NULL,
  slot_id INT NOT NULL,
  agency_id INT NOT NULL,
  school_agency_id INT NOT NULL,
  modality VARCHAR(32) NOT NULL,
  starts_at DATETIME NOT NULL,
  ends_at DATETIME NOT NULL,
  location_mode VARCHAR(32) NOT NULL DEFAULT 'school',
  location_text VARCHAR(500) NULL DEFAULT NULL,
  meet_link VARCHAR(1024) NULL DEFAULT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'booked'
    COMMENT 'booked, cancelled',
  invited_school_staff_json JSON NULL DEFAULT NULL,
  invited_at DATETIME NULL DEFAULT NULL,
  booked_by_actor_type VARCHAR(32) NULL DEFAULT NULL,
  booked_by_user_id INT NULL DEFAULT NULL,
  booked_by_display_name VARCHAR(255) NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_checkin_booking_cycle (cycle_id),
  INDEX idx_checkin_booking_slot (slot_id),
  INDEX idx_checkin_booking_agency_year (agency_id, school_agency_id),
  CONSTRAINT fk_checkin_booking_cycle
    FOREIGN KEY (cycle_id) REFERENCES school_reinit_cycles(id) ON DELETE CASCADE,
  CONSTRAINT fk_checkin_booking_slot
    FOREIGN KEY (slot_id) REFERENCES school_reinit_checkin_slots(id) ON DELETE RESTRICT,
  CONSTRAINT fk_checkin_booking_agency
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_checkin_booking_school
    FOREIGN KEY (school_agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_checkin_booking_user
    FOREIGN KEY (booked_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
