-- Scheduling taxonomy + service code eligibility foundation
-- Additive migration only: new lookup tables + nullable booking/event columns.

CREATE TABLE IF NOT EXISTS appointment_types (
  code VARCHAR(64) NOT NULL,
  label VARCHAR(120) NOT NULL,
  color_token VARCHAR(64) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (code),
  KEY idx_appointment_types_active_sort (is_active, sort_order, code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS appointment_subtypes (
  code VARCHAR(64) NOT NULL,
  appointment_type_code VARCHAR(64) NOT NULL,
  label VARCHAR(120) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (code),
  KEY idx_appointment_subtypes_type_active_sort (appointment_type_code, is_active, sort_order, code),
  CONSTRAINT fk_appointment_subtypes_type
    FOREIGN KEY (appointment_type_code) REFERENCES appointment_types(code) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS scheduling_service_codes (
  code VARCHAR(32) NOT NULL,
  label VARCHAR(160) NOT NULL,
  is_billable TINYINT(1) NOT NULL DEFAULT 1,
  default_note_type VARCHAR(64) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (code),
  KEY idx_scheduling_service_codes_active (is_active, code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS credential_service_code_eligibility (
  credential_tier VARCHAR(64) NOT NULL,
  service_code VARCHAR(32) NOT NULL,
  allowed TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (credential_tier, service_code),
  KEY idx_credential_service_code_allowed (credential_tier, allowed, service_code),
  CONSTRAINT fk_credential_service_code_eligibility_code
    FOREIGN KEY (service_code) REFERENCES scheduling_service_codes(code) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO appointment_types (code, label, color_token, sort_order, is_active) VALUES
('SESSION', 'Session', 'session', 10, 1),
('SUPERVISION', 'Supervision', 'supervision', 20, 1),
('ASSESSMENT', 'Assessment/Evaluation', 'assessment', 30, 1),
('AVAILABLE_SLOT', 'Available Slot', 'available', 40, 1),
('SCHEDULE_BLOCK', 'Schedule Block', 'block', 50, 1),
('MEETING', 'Meeting', 'meeting', 60, 1),
('EVENT', 'Event', 'event', 70, 1),
('INDIRECT_SERVICES', 'Indirect Services', 'indirect', 80, 1);

INSERT IGNORE INTO appointment_subtypes (code, appointment_type_code, label, sort_order, is_active) VALUES
('AVAILABLE_INTAKE', 'AVAILABLE_SLOT', 'Available Intake', 10, 1),
('AVAILABLE_SESSION', 'AVAILABLE_SLOT', 'Available Session', 20, 1),
('PERSONAL', 'EVENT', 'Personal', 10, 1),
('SCHEDULE_HOLD', 'EVENT', 'Schedule Hold', 20, 1),
('GROUP_THERAPY', 'SESSION', 'Group Therapy', 30, 1),
('TELEHEALTH', 'SESSION', 'Telehealth', 40, 1);

INSERT IGNORE INTO scheduling_service_codes (code, label, is_billable, default_note_type, is_active) VALUES
('H0032', 'Mental health service plan development', 1, 'PROGRESS_NOTE', 1),
('H2014', 'Skills training and development', 1, 'PROGRESS_NOTE', 1),
('H2022', 'Community psychiatric supportive treatment', 1, 'PROGRESS_NOTE', 1),
('ADMIN', 'Administrative/Non-billable', 0, 'ADMIN_NOTE', 1);

INSERT IGNORE INTO credential_service_code_eligibility (credential_tier, service_code, allowed) VALUES
('qbha', 'H2014', 1),
('qbha', 'H2022', 1),
('bachelors', 'H0032', 1),
('bachelors', 'H2014', 1),
('bachelors', 'H2022', 1),
('intern_plus', 'H0032', 1),
('intern_plus', 'H2014', 1),
('intern_plus', 'H2022', 1),
('intern_plus', 'ADMIN', 1),
('qbha', 'ADMIN', 1),
('bachelors', 'ADMIN', 1);

ALTER TABLE office_booking_requests
  ADD COLUMN appointment_type_code VARCHAR(64) NULL AFTER recurrence,
  ADD COLUMN appointment_subtype_code VARCHAR(64) NULL AFTER appointment_type_code,
  ADD COLUMN service_code VARCHAR(32) NULL AFTER appointment_subtype_code,
  ADD COLUMN modality ENUM('IN_PERSON','TELEHEALTH') NULL AFTER service_code;

ALTER TABLE office_booking_requests
  ADD KEY idx_office_booking_requests_appt_type (appointment_type_code),
  ADD KEY idx_office_booking_requests_service_code (service_code);

ALTER TABLE office_events
  ADD COLUMN appointment_type_code VARCHAR(64) NULL AFTER slot_state,
  ADD COLUMN appointment_subtype_code VARCHAR(64) NULL AFTER appointment_type_code,
  ADD COLUMN service_code VARCHAR(32) NULL AFTER appointment_subtype_code,
  ADD COLUMN modality ENUM('IN_PERSON','TELEHEALTH') NULL AFTER service_code,
  ADD COLUMN status_outcome ENUM('MISSED','NO_SHOW','CANCELED','COMPLETED') NULL AFTER status,
  ADD COLUMN cancellation_reason VARCHAR(255) NULL AFTER status_outcome;

ALTER TABLE office_events
  ADD KEY idx_office_events_type_time (appointment_type_code, start_at),
  ADD KEY idx_office_events_service_code (service_code),
  ADD KEY idx_office_events_status_outcome (status_outcome);
