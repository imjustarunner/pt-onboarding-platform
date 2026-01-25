-- Migration: Office kiosk (event-based) tables
-- Purpose:
-- - Kiosk check-in tied to office_events (metadata-only)
-- - Questionnaire assignment to offices (reusing existing modules/forms)
-- - Questionnaire responses stored per provider+office+room+event

CREATE TABLE IF NOT EXISTS office_event_checkins (
  id INT AUTO_INCREMENT PRIMARY KEY,
  event_id INT NOT NULL,
  office_location_id INT NOT NULL,
  room_id INT NOT NULL,
  provider_id INT NOT NULL,
  checked_in_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_office_event_checkins_event
    FOREIGN KEY (event_id) REFERENCES office_events(id) ON DELETE CASCADE,
  CONSTRAINT fk_office_event_checkins_office
    FOREIGN KEY (office_location_id) REFERENCES office_locations(id) ON DELETE CASCADE,
  CONSTRAINT fk_office_event_checkins_room
    FOREIGN KEY (room_id) REFERENCES office_rooms(id) ON DELETE CASCADE,
  CONSTRAINT fk_office_event_checkins_provider
    FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY uniq_office_event_checkins_event (event_id),
  INDEX idx_office_event_checkins_office_time (office_location_id, checked_in_at),
  INDEX idx_office_event_checkins_provider_time (provider_id, checked_in_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Which questionnaires (modules) are available at a given office.
-- Optional agency_id allows restricting a module to a subset of office agencies.
CREATE TABLE IF NOT EXISTS office_questionnaire_modules (
  office_location_id INT NOT NULL,
  module_id INT NOT NULL,
  agency_id INT NULL,
  -- MySQL does not allow NULL columns in a PRIMARY KEY.
  -- We still want agency_id optional, while enforcing uniqueness for NULL as well.
  agency_id_norm INT NOT NULL GENERATED ALWAYS AS (IFNULL(agency_id, 0)) STORED,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (office_location_id, module_id, agency_id_norm),
  CONSTRAINT fk_office_questionnaire_modules_office
    FOREIGN KEY (office_location_id) REFERENCES office_locations(id) ON DELETE CASCADE,
  CONSTRAINT fk_office_questionnaire_modules_module
    FOREIGN KEY (module_id) REFERENCES modules(id) ON DELETE CASCADE,
  CONSTRAINT fk_office_questionnaire_modules_agency
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  INDEX idx_office_questionnaire_modules_office_active (office_location_id, is_active),
  INDEX idx_office_questionnaire_modules_agency (agency_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS office_questionnaire_responses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  office_location_id INT NOT NULL,
  room_id INT NOT NULL,
  event_id INT NOT NULL,
  provider_id INT NOT NULL,
  module_id INT NOT NULL,
  answers JSON NOT NULL,
  typical_day_time BOOLEAN NOT NULL DEFAULT FALSE,
  append_to_slot_history BOOLEAN NOT NULL DEFAULT FALSE,
  slot_history_key VARCHAR(128) NULL,
  hidden_by_provider BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_office_questionnaire_responses_office
    FOREIGN KEY (office_location_id) REFERENCES office_locations(id) ON DELETE CASCADE,
  CONSTRAINT fk_office_questionnaire_responses_room
    FOREIGN KEY (room_id) REFERENCES office_rooms(id) ON DELETE CASCADE,
  CONSTRAINT fk_office_questionnaire_responses_event
    FOREIGN KEY (event_id) REFERENCES office_events(id) ON DELETE CASCADE,
  CONSTRAINT fk_office_questionnaire_responses_provider
    FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_office_questionnaire_responses_module
    FOREIGN KEY (module_id) REFERENCES modules(id) ON DELETE CASCADE,
  INDEX idx_office_questionnaire_responses_event (event_id),
  INDEX idx_office_questionnaire_responses_provider (provider_id, created_at),
  INDEX idx_office_questionnaire_responses_slot_history (slot_history_key, created_at),
  INDEX idx_office_questionnaire_responses_hidden (hidden_by_provider, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

