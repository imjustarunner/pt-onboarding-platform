-- Migration 1403: Book Session overhaul — group codes, scheduled status, others present, my room

ALTER TABLE agency_medical_service_codes
  ADD COLUMN session_mode VARCHAR(16) NOT NULL DEFAULT 'either'
  COMMENT 'individual | group | either — filters Book Session primary codes'
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Table column is service_code (not code)
UPDATE agency_medical_service_codes
SET session_mode = 'group'
WHERE UPPER(service_code) IN ('90853', '90849');

UPDATE agency_medical_service_codes
SET session_mode = 'individual'
WHERE UPPER(service_code) IN ('90791','90832','90834','90837','90839','H0004','H0031','H0032','H0023')
  AND session_mode = 'either';

UPDATE agency_medical_service_codes
SET session_mode = 'either'
WHERE UPPER(service_code) IN ('90846','90847','H2014','H2015','H2016','H2017','H2018');

-- appointments: others present free-text names, video room mode, notification mode
ALTER TABLE appointments
  ADD COLUMN others_present_names VARCHAR(500) NULL DEFAULT NULL
  COMMENT 'Free-text names when Client and Others attendance'
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE appointments
  ADD COLUMN video_room_mode VARCHAR(32) NULL DEFAULT 'unique_session'
  COMMENT 'unique_session | my_room — virtual join strategy'
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE appointments
  ADD COLUMN notification_mode VARCHAR(32) NULL DEFAULT 'default'
  COMMENT 'default | customizable'
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Provider My Room (persistent public lobby — never auto-admits)
CREATE TABLE IF NOT EXISTS provider_my_rooms (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  agency_id INT NULL,
  slug VARCHAR(64) NOT NULL,
  join_token VARCHAR(64) NOT NULL,
  display_name VARCHAR(255) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_provider_my_rooms_user (user_id),
  UNIQUE KEY uq_provider_my_rooms_slug (slug),
  UNIQUE KEY uq_provider_my_rooms_token (join_token),
  KEY idx_provider_my_rooms_agency (agency_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS provider_my_room_lobby (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  my_room_id BIGINT UNSIGNED NOT NULL,
  guest_display_name VARCHAR(255) NOT NULL,
  guest_photo_url VARCHAR(1024) NULL,
  client_id INT NULL,
  appointment_id INT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'waiting'
    COMMENT 'waiting | admitted | dismissed | left'
    CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  photo_required_ack TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  admitted_at DATETIME NULL,
  admitted_by_user_id INT NULL,
  KEY idx_my_room_lobby_room_status (my_room_id, status),
  CONSTRAINT fk_my_room_lobby_room FOREIGN KEY (my_room_id) REFERENCES provider_my_rooms(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Session reminder interaction tracking for 7→24→4 cadence
ALTER TABLE appointment_reminders
  ADD COLUMN interaction_json JSON NULL
  COMMENT 'opened_at, chosen_cadence, confirmed_at, opt_out_email, calendar_clicked';

-- Booking metadata also lives on schedule events for non-appointment facets
ALTER TABLE provider_schedule_events
  ADD COLUMN others_present_names VARCHAR(500) NULL DEFAULT NULL
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE provider_schedule_events
  ADD COLUMN video_room_mode VARCHAR(32) NULL DEFAULT NULL
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
