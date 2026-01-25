-- Migration: Standing assignments + booking plans + office_events slot_state
-- Purpose:
-- - Support four schedule states: open, assigned_available, assigned_temporary, assigned_booked
-- - Model repeating standing assignments (weekly/biweekly) separately from booked occurrences
-- - Materialize occurrences into office_events with slot_state for kiosk + weekly grid

ALTER TABLE office_events
  ADD COLUMN slot_state ENUM('ASSIGNED_AVAILABLE','ASSIGNED_TEMPORARY','ASSIGNED_BOOKED') NULL AFTER status,
  ADD COLUMN standing_assignment_id INT NULL AFTER room_id,
  ADD COLUMN booking_plan_id INT NULL AFTER standing_assignment_id;

CREATE INDEX idx_office_events_slot_state_time
  ON office_events (office_location_id, slot_state, start_at);

-- Standing assignment: a provider has a reserved repeating slot in a room
CREATE TABLE IF NOT EXISTS office_standing_assignments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  office_location_id INT NOT NULL,
  room_id INT NOT NULL,
  provider_id INT NOT NULL,
  weekday TINYINT NOT NULL COMMENT '0=Sunday .. 6=Saturday',
  hour TINYINT NOT NULL COMMENT '24h start hour, 7..21',
  assigned_frequency ENUM('WEEKLY','BIWEEKLY') NOT NULL,
  availability_mode ENUM('AVAILABLE','TEMPORARY') NOT NULL DEFAULT 'AVAILABLE',
  temporary_until_date DATE NULL COMMENT 'If TEMPORARY, lasts through this date (inclusive)',
  available_since_date DATE NULL COMMENT 'For 6-week unbooked auto-forfeit logic',
  last_two_week_confirmed_at DATETIME NULL,
  last_six_week_checked_at DATETIME NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by_user_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_office_standing_assignments_office
    FOREIGN KEY (office_location_id) REFERENCES office_locations(id) ON DELETE CASCADE,
  CONSTRAINT fk_office_standing_assignments_room
    FOREIGN KEY (room_id) REFERENCES office_rooms(id) ON DELETE CASCADE,
  CONSTRAINT fk_office_standing_assignments_provider
    FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_office_standing_assignments_created_by
    FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  UNIQUE KEY uniq_office_standing_assignment_slot (room_id, provider_id, weekday, hour, assigned_frequency),
  INDEX idx_office_standing_assignments_office (office_location_id, is_active),
  INDEX idx_office_standing_assignments_room (room_id, is_active),
  INDEX idx_office_standing_assignments_provider (provider_id, is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Booking plan: provider indicates which occurrences should be booked (weekly/biweekly/monthly)
CREATE TABLE IF NOT EXISTS office_booking_plans (
  id INT AUTO_INCREMENT PRIMARY KEY,
  standing_assignment_id INT NOT NULL,
  booked_frequency ENUM('WEEKLY','BIWEEKLY','MONTHLY') NOT NULL,
  booking_start_date DATE NOT NULL COMMENT 'Used to anchor biweekly/monthly pattern',
  active_until_date DATE NULL COMMENT '6-week confirmation window boundary (optional, system-managed)',
  last_confirmed_at DATETIME NULL COMMENT '6-week “Is this still booked?” confirmation',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by_user_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_office_booking_plans_assignment
    FOREIGN KEY (standing_assignment_id) REFERENCES office_standing_assignments(id) ON DELETE CASCADE,
  CONSTRAINT fk_office_booking_plans_created_by
    FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  INDEX idx_office_booking_plans_active (standing_assignment_id, is_active),
  INDEX idx_office_booking_plans_until (active_until_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

