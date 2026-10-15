-- Internal schedule reminders are deliberately separate from client-facing appointments.
CREATE TABLE IF NOT EXISTS appointment_staff_alerts (
  appointment_id INT NOT NULL PRIMARY KEY,
  alert_text MEDIUMTEXT NULL,
  revision INT NOT NULL DEFAULT 1,
  updated_by_user_id INT NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS appointment_staff_alert_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  appointment_id INT NOT NULL,
  revision INT NOT NULL,
  alert_text MEDIUMTEXT NULL,
  actor_user_id INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_appointment_staff_alert_history (appointment_id, revision)
);
