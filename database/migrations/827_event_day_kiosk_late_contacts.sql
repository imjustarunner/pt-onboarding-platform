-- Migration 827: Late-arrival family contact log at event-day kiosk
-- Staff record who they contacted, how, reply status, and attendance outcome.

CREATE TABLE IF NOT EXISTS event_day_kiosk_late_contacts (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  company_event_id INT NOT NULL,
  agency_id INT NOT NULL,
  client_id INT NOT NULL,
  kiosk_date DATE NOT NULL,
  staff_user_id INT NULL DEFAULT NULL,
  contact_target_type ENUM('guardian', 'emergency_contact') NULL DEFAULT NULL,
  contact_target_ref VARCHAR(120) NULL DEFAULT NULL
    COMMENT 'Guardian user id or emergency contact index key',
  contact_name VARCHAR(255) NULL DEFAULT NULL,
  contact_relationship VARCHAR(120) NULL DEFAULT NULL,
  contact_phone VARCHAR(64) NULL DEFAULT NULL,
  contact_email VARCHAR(255) NULL DEFAULT NULL,
  contact_method ENUM('text', 'email', 'phone') NULL DEFAULT NULL,
  phone_outcome ENUM('successful', 'unsuccessful') NULL DEFAULT NULL,
  reply_status ENUM('reply', 'no_reply', 'auto_reply') NULL DEFAULT NULL,
  attendance_outcome ENUM('attending', 'not_attending', 'pending') NULL DEFAULT NULL,
  absence_reason VARCHAR(500) NULL DEFAULT NULL,
  contacted_at DATETIME NULL DEFAULT NULL,
  resolved_at DATETIME NULL DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_edklc_client_day (company_event_id, client_id, kiosk_date),
  INDEX idx_edklc_event_day (company_event_id, kiosk_date),
  INDEX idx_edklc_staff (staff_user_id),
  CONSTRAINT fk_edklc_event FOREIGN KEY (company_event_id) REFERENCES company_events(id) ON DELETE CASCADE,
  CONSTRAINT fk_edklc_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  CONSTRAINT fk_edklc_staff FOREIGN KEY (staff_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
