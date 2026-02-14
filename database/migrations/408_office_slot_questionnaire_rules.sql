-- Migration: Per-slot questionnaire rules for kiosk client check-in
-- Assign surveys to specific rooms/times (e.g. Room 3, Saturdays, 9am-5pm -> PHQ9)

CREATE TABLE IF NOT EXISTS office_slot_questionnaire_rules (
  id INT AUTO_INCREMENT PRIMARY KEY,
  office_location_id INT NOT NULL,
  room_id INT NULL COMMENT 'null = all rooms',
  day_of_week TINYINT NULL COMMENT '0=Sun..6=Sat, null = all days',
  hour_start TINYINT NULL COMMENT '0-23, null = all hours',
  hour_end TINYINT NULL COMMENT '0-23, null = same as hour_start',
  module_id INT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_slot_rules_office (office_location_id),
  INDEX idx_slot_rules_room (room_id),
  INDEX idx_slot_rules_module (module_id),
  CONSTRAINT fk_slot_rules_office FOREIGN KEY (office_location_id) REFERENCES office_locations(id) ON DELETE CASCADE,
  CONSTRAINT fk_slot_rules_room FOREIGN KEY (room_id) REFERENCES office_rooms(id) ON DELETE CASCADE,
  CONSTRAINT fk_slot_rules_module FOREIGN KEY (module_id) REFERENCES modules(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
