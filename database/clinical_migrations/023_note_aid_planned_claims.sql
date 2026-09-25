-- Permanent encounter identity survives clearing/expiring a personal work queue.
CREATE TABLE IF NOT EXISTS note_aid_planned_services (
  agency_id INT NOT NULL,
  import_key CHAR(64) NOT NULL,
  client_id INT NOT NULL,
  provider_user_id INT NOT NULL,
  clinical_session_id BIGINT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (agency_id, import_key),
  INDEX idx_planned_session (agency_id, clinical_session_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
