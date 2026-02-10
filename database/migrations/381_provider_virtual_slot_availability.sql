-- Provider-level slot overrides for virtual availability (including intake).
CREATE TABLE IF NOT EXISTS provider_virtual_slot_availability (
  id INT PRIMARY KEY AUTO_INCREMENT,
  agency_id INT NOT NULL,
  provider_id INT NOT NULL,
  office_location_id INT NULL,
  room_id INT NULL,
  start_at DATETIME NOT NULL,
  end_at DATETIME NOT NULL,
  session_type ENUM('INTAKE', 'REGULAR', 'BOTH') NOT NULL DEFAULT 'INTAKE',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  source VARCHAR(32) NOT NULL DEFAULT 'OFFICE_EVENT',
  source_event_id INT NULL,
  created_by_user_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_provider_virtual_slot (agency_id, provider_id, start_at, end_at),
  INDEX idx_provider_virtual_slot_window (provider_id, start_at, end_at, is_active),
  INDEX idx_provider_virtual_slot_agency (agency_id, provider_id, is_active)
);
