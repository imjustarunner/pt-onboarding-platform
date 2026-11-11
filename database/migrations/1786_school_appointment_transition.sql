-- Explicit school planning-to-appointment links. Nothing is activated by DDL.
CREATE TABLE IF NOT EXISTS school_schedule_transitions (
  agency_id INT NOT NULL,
  school_organization_id INT NOT NULL,
  provider_user_id INT NOT NULL,
  effective_date DATE NOT NULL,
  revision INT NOT NULL DEFAULT 1,
  created_by_user_id INT NOT NULL,
  updated_by_user_id INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (agency_id, school_organization_id, provider_user_id),
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE RESTRICT,
  FOREIGN KEY (school_organization_id) REFERENCES agencies(id) ON DELETE RESTRICT,
  FOREIGN KEY (provider_user_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS school_schedule_appointment_links (
  appointment_id INT UNSIGNED NOT NULL PRIMARY KEY,
  slot_id INT NULL,
  planning_weekday VARCHAR(12) NOT NULL,
  agency_id INT NOT NULL,
  school_organization_id INT NOT NULL,
  provider_user_id INT NOT NULL,
  client_id INT NOT NULL,
  series_key VARCHAR(100) NULL,
  created_by_user_id INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX school_link_window (agency_id, school_organization_id, provider_user_id),
  INDEX school_link_slot (slot_id, appointment_id),
  INDEX school_link_series (series_key),
  FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE RESTRICT,
  FOREIGN KEY (slot_id) REFERENCES soft_schedule_slots(id) ON DELETE SET NULL,
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE RESTRICT,
  FOREIGN KEY (school_organization_id) REFERENCES agencies(id) ON DELETE RESTRICT,
  FOREIGN KEY (provider_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Legacy placement/offboarding workflows can reuse a planning row. Retain the
-- booked occurrence and its school/client snapshot instead of linking a new
-- client to the old appointment when the planning identity changes.
DROP TRIGGER IF EXISTS school_schedule_slot_identity_detach;
CREATE TRIGGER school_schedule_slot_identity_detach
BEFORE UPDATE ON soft_schedule_slots
FOR EACH ROW
UPDATE school_schedule_appointment_links SET slot_id=NULL
WHERE slot_id=OLD.id AND (
  NOT (OLD.client_id <=> NEW.client_id)
  OR OLD.school_organization_id<>NEW.school_organization_id
  OR OLD.provider_user_id<>NEW.provider_user_id
  OR OLD.weekday<>NEW.weekday
);
