CREATE TABLE IF NOT EXISTS guardian_appointment_requests (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  appointment_id INT NOT NULL,
  client_id INT NOT NULL,
  requested_by_user_id INT NOT NULL,
  request_type ENUM('cancel','reschedule') NOT NULL,
  reason_encrypted TEXT NOT NULL,
  status ENUM('pending','approved','declined') NOT NULL DEFAULT 'pending',
  decided_by_user_id INT NULL,
  decision_reason_encrypted TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  decided_at DATETIME NULL,
  KEY guardian_appointment_pending (appointment_id,status),
  KEY guardian_appointment_client (agency_id,client_id)
);
