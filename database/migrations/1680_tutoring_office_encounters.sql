-- A standing office keeps its public link; each visit has an isolated workspace.
CREATE TABLE IF NOT EXISTS tutoring_office_encounters (
  room_id INT NOT NULL,
  generation INT NOT NULL,
  agency_id INT NOT NULL,
  learning_session_id BIGINT NULL,
  appointment_id BIGINT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ended_at DATETIME NULL,
  PRIMARY KEY (room_id, generation),
  INDEX idx_tutoring_office_learning (learning_session_id),
  INDEX idx_tutoring_office_appointment (appointment_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE private_virtual_office_visits ADD COLUMN tutoring_client_id INT NULL;
