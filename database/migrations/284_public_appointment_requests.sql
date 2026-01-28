/*
Add public appointment requests (from website / external consumer).

Note: Use block comments because the migration runner drops `--`-prefixed statements.
*/

CREATE TABLE public_appointment_requests (
  id INT NOT NULL AUTO_INCREMENT,
  agency_id INT NOT NULL,
  provider_id INT NOT NULL,
  modality VARCHAR(16) NOT NULL,
  requested_start_at DATETIME NOT NULL,
  requested_end_at DATETIME NOT NULL,
  client_name VARCHAR(255) NOT NULL,
  client_email VARCHAR(320) NOT NULL,
  client_phone VARCHAR(64) NULL,
  notes TEXT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'PENDING',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_public_appt_requests_agency_status (agency_id, status, requested_start_at),
  KEY idx_public_appt_requests_provider (provider_id, requested_start_at)
);

