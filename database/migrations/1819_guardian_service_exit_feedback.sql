ALTER TABLE guardian_service_cancellations ADD COLUMN team_notified_at DATETIME(3) NULL;

CREATE TABLE IF NOT EXISTS guardian_service_exit_feedback (
  operation_id CHAR(36) NOT NULL PRIMARY KEY,
  agency_id INT NOT NULL,
  client_id INT NOT NULL,
  actor_user_id INT NOT NULL,
  request_hash CHAR(64) NOT NULL,
  payload_encrypted LONGTEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_guardian_exit_feedback_client (agency_id, client_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
