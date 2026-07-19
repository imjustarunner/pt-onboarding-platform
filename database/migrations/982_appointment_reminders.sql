-- Migration 982: Appointment reminder schedules + communication timeline (Phase 4)

CREATE TABLE IF NOT EXISTS appointment_reminders (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  appointment_id INT UNSIGNED NOT NULL,
  agency_id INT NOT NULL,
  channel ENUM('email', 'sms', 'phone') NOT NULL DEFAULT 'email',
  offset_minutes INT NOT NULL DEFAULT 1440
    COMMENT 'Minutes before start_at to send (e.g. 1440 = 24h)',
  scheduled_for DATETIME NOT NULL,
  status ENUM('pending', 'sent', 'skipped', 'failed', 'canceled') NOT NULL DEFAULT 'pending',
  skip_reason VARCHAR(255) NULL DEFAULT NULL
    COMMENT 'no_consent|no_recipient|channel_disabled|canceled_appt|…',
  sent_at DATETIME NULL DEFAULT NULL,
  error_message VARCHAR(500) NULL DEFAULT NULL,
  recipient_participant_id INT UNSIGNED NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_ar_due (status, scheduled_for),
  KEY idx_ar_appointment (appointment_id),
  KEY idx_ar_agency (agency_id, status),
  CONSTRAINT fk_ar_appointment
    FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE,
  CONSTRAINT fk_ar_agency
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS appointment_communications (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  appointment_id INT UNSIGNED NOT NULL,
  agency_id INT NOT NULL,
  direction ENUM('outbound', 'inbound', 'system') NOT NULL DEFAULT 'outbound',
  channel ENUM('email', 'sms', 'phone', 'in_app', 'other') NOT NULL DEFAULT 'email',
  kind VARCHAR(64) NOT NULL DEFAULT 'reminder'
    COMMENT 'reminder|confirm_reply|cancel_reply|staff_note|waiver|other',
  body_preview VARCHAR(500) NULL DEFAULT NULL,
  metadata_json JSON NULL,
  reminder_id INT UNSIGNED NULL DEFAULT NULL,
  created_by_user_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_ac_appointment (appointment_id, created_at),
  KEY idx_ac_agency (agency_id, created_at),
  CONSTRAINT fk_ac_appointment
    FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE,
  CONSTRAINT fk_ac_agency
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS appointment_reply_reviews (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  appointment_id INT UNSIGNED NOT NULL,
  agency_id INT NOT NULL,
  channel ENUM('sms', 'email', 'other') NOT NULL DEFAULT 'sms',
  raw_body TEXT NOT NULL,
  interpreted_intent ENUM('confirm', 'cancel', 'reschedule', 'unknown') NOT NULL DEFAULT 'unknown',
  status ENUM('pending_review', 'applied', 'dismissed') NOT NULL DEFAULT 'pending_review',
  reviewed_by_user_id INT NULL,
  reviewed_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_arr_agency_status (agency_id, status),
  KEY idx_arr_appointment (appointment_id),
  CONSTRAINT fk_arr_appointment
    FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE,
  CONSTRAINT fk_arr_agency
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS booking_agency_settings (
  agency_id INT NOT NULL,
  reminder_defaults_json JSON NULL
    COMMENT 'e.g. [{channel:"email",offsetMinutes:1440},{channel:"sms",offsetMinutes:120}]',
  updated_by_user_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (agency_id),
  CONSTRAINT fk_bas_agency
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
