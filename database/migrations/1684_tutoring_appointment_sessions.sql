-- A scheduled appointment and its learning workspace are the same visit.
CREATE TABLE IF NOT EXISTS tutoring_appointment_sessions (
 appointment_id INT NOT NULL PRIMARY KEY,
 session_id BIGINT NOT NULL,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY uq_tutoring_appointment_session (session_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
