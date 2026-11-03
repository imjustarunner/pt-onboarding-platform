-- Staff acknowledgement is bound to one encrypted alert revision. Editing the alert
-- requires fresh acknowledgement without changing any clinical note or claim.
CREATE TABLE IF NOT EXISTS appointment_staff_alert_acknowledgements (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  appointment_id INT UNSIGNED NOT NULL,
  revision INT NOT NULL,
  acknowledged_by_user_id INT NOT NULL,
  acknowledged_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_appointment_alert_ack (appointment_id,revision,acknowledged_by_user_id),
  KEY idx_appointment_alert_actor (acknowledged_by_user_id,appointment_id),
  CONSTRAINT fk_alert_ack_appointment FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TRIGGER appointment_alert_ack_no_update BEFORE UPDATE ON appointment_staff_alert_acknowledgements FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Appointment alert acknowledgements are append-only';
CREATE TRIGGER appointment_alert_ack_no_delete BEFORE DELETE ON appointment_staff_alert_acknowledgements FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Appointment alert acknowledgement history cannot be deleted';
