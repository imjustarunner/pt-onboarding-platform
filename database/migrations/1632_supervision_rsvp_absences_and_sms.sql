CREATE TABLE IF NOT EXISTS supervision_rsvp_absences (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  recurrence_series_id VARCHAR(64) NOT NULL,
  user_id INT NOT NULL,
  source_session_id INT NOT NULL,
  starts_at DATETIME NOT NULL,
  ends_at DATETIME NOT NULL,
  through_date DATE NOT NULL,
  weekday TINYINT NULL,
  reason VARCHAR(2000) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_supervision_absence_series (agency_id, recurrence_series_id, user_id, ends_at)
);
CREATE TABLE IF NOT EXISTS supervision_rsvp_sms_deliveries (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  session_id INT NOT NULL,
  user_id INT NOT NULL,
  delivery_kind VARCHAR(80) NOT NULL,
  start_at DATETIME NOT NULL,
  delivery_status VARCHAR(20) NOT NULL DEFAULT 'sending',
  provider_ref VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_supervision_rsvp_sms (session_id,user_id,delivery_kind,start_at)
);
