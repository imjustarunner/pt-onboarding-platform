-- Per-appointment reminder choices survive edits and recurrence materialization.
CREATE TABLE IF NOT EXISTS appointment_notification_customizations (
  appointment_id INT UNSIGNED NOT NULL,
  agency_id INT NOT NULL,
  rules_json JSON NOT NULL,
  updated_by_user_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (appointment_id),
  KEY idx_appointment_notification_customizations_agency (agency_id),
  CONSTRAINT fk_appointment_notification_customizations_appointment
    FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
