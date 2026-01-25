-- Migration: Office availability + events foundation
-- Purpose:
-- - Provider-managed in-office availability grid (Mon–Sun, 7am–9pm hourly)
-- - Events-based office booking foundation (for room schedule + kiosk)

-- Global provider toggle (auto-disabled when no availability rows exist)
ALTER TABLE users
  ADD COLUMN in_office_available BOOLEAN NOT NULL DEFAULT FALSE
  AFTER provider_accepting_new_clients;

-- Provider in-office availability per office + weekday + hour slot
CREATE TABLE IF NOT EXISTS provider_in_office_availability (
  id INT AUTO_INCREMENT PRIMARY KEY,
  provider_id INT NOT NULL,
  office_location_id INT NOT NULL,
  weekday TINYINT NOT NULL COMMENT '0=Sunday .. 6=Saturday',
  hour TINYINT NOT NULL COMMENT '24h integer, typically 7..20 for 7am..8pm start',
  is_available BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_provider_in_office_availability_provider
    FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_provider_in_office_availability_office
    FOREIGN KEY (office_location_id) REFERENCES office_locations(id) ON DELETE CASCADE,
  UNIQUE KEY uniq_provider_office_day_hour (provider_id, office_location_id, weekday, hour),
  INDEX idx_provider_in_office_availability_office (office_location_id, weekday, hour),
  INDEX idx_provider_in_office_availability_provider (provider_id, weekday, hour)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Track confirmations (payroll prompt + biweekly review)
CREATE TABLE IF NOT EXISTS provider_in_office_confirmations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  provider_id INT NOT NULL,
  confirmation_type ENUM('PAYROLL','BIWEEKLY') NOT NULL,
  required_at DATETIME NULL,
  confirmed_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_provider_in_office_confirmations_provider
    FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY uniq_provider_confirmation_type (provider_id, confirmation_type),
  INDEX idx_provider_in_office_confirmations_required (confirmation_type, required_at),
  INDEX idx_provider_in_office_confirmations_confirmed (confirmation_type, confirmed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Events-based office booking schedule (hourly reservations + releases)
CREATE TABLE IF NOT EXISTS office_events (
  id INT AUTO_INCREMENT PRIMARY KEY,
  office_location_id INT NOT NULL,
  room_id INT NOT NULL,
  start_at DATETIME NOT NULL,
  end_at DATETIME NOT NULL,
  status ENUM('RELEASED','BOOKED','CANCELLED') NOT NULL,
  -- Standing assignment owner for the slot (who may approve yellow requests)
  assigned_provider_id INT NULL,
  -- Provider who ultimately booked the slot (may differ from assigned_provider_id)
  booked_provider_id INT NULL,
  source ENUM('SUPPORT','PROVIDER_REQUEST','YELLOW_CLAIM','ADMIN_OVERRIDE') NOT NULL,
  recurrence_group_id VARCHAR(64) NULL,
  notes TEXT NULL,
  created_by_user_id INT NOT NULL,
  approved_by_user_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_office_events_office
    FOREIGN KEY (office_location_id) REFERENCES office_locations(id) ON DELETE CASCADE,
  CONSTRAINT fk_office_events_room
    FOREIGN KEY (room_id) REFERENCES office_rooms(id) ON DELETE CASCADE,
  CONSTRAINT fk_office_events_assigned_provider
    FOREIGN KEY (assigned_provider_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_office_events_booked_provider
    FOREIGN KEY (booked_provider_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_office_events_created_by
    FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_office_events_approved_by
    FOREIGN KEY (approved_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_office_events_office_time (office_location_id, start_at, end_at),
  INDEX idx_office_events_room_time (room_id, start_at, end_at),
  INDEX idx_office_events_status_time (status, start_at, end_at),
  INDEX idx_office_events_booked_provider_time (booked_provider_id, start_at, end_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Requests (provider request + yellow-claim) with approvals/comments
CREATE TABLE IF NOT EXISTS office_booking_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  request_type ENUM('PROVIDER_REQUEST','YELLOW_CLAIM') NOT NULL,
  status ENUM('PENDING','APPROVED','DENIED','CANCELLED') NOT NULL DEFAULT 'PENDING',
  office_location_id INT NOT NULL,
  room_id INT NULL,
  requested_provider_id INT NOT NULL,
  start_at DATETIME NOT NULL,
  end_at DATETIME NOT NULL,
  recurrence ENUM('ONCE','WEEKLY','BIWEEKLY','MONTHLY') NOT NULL DEFAULT 'ONCE',
  open_to_alternative_room BOOLEAN NOT NULL DEFAULT FALSE,
  requested_room_type_ids JSON NULL,
  requester_notes TEXT NULL,
  approver_comment TEXT NULL,
  decided_by_user_id INT NULL,
  decided_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_office_booking_requests_office
    FOREIGN KEY (office_location_id) REFERENCES office_locations(id) ON DELETE CASCADE,
  CONSTRAINT fk_office_booking_requests_room
    FOREIGN KEY (room_id) REFERENCES office_rooms(id) ON DELETE SET NULL,
  CONSTRAINT fk_office_booking_requests_requested_provider
    FOREIGN KEY (requested_provider_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_office_booking_requests_decided_by
    FOREIGN KEY (decided_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_office_booking_requests_office_status (office_location_id, status),
  INDEX idx_office_booking_requests_status_created (status, created_at),
  INDEX idx_office_booking_requests_provider_time (requested_provider_id, start_at, end_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

