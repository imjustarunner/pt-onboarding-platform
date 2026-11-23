-- Optional historical termination details and a durable, reviewed final outreach.
-- The existing workflow flag is retained for compatibility with inactive rosters.
ALTER TABLE clients
  ADD COLUMN termination_effective_date DATE NULL,
  ADD COLUMN termination_last_provider_id INT NULL,
  ADD COLUMN termination_last_provider_name VARCHAR(255) NULL,
  ADD COLUMN enrollment_followup_id BIGINT UNSIGNED NULL,
  ADD COLUMN enrollment_reopened_at DATETIME NULL,
  ADD COLUMN enrollment_reopened_source VARCHAR(32) NULL,
  ADD CONSTRAINT fk_clients_termination_last_provider
    FOREIGN KEY (termination_last_provider_id) REFERENCES users(id) ON DELETE SET NULL;

CREATE TABLE client_enrollment_followups (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  client_id INT NOT NULL,
  agency_id INT NOT NULL,
  created_by_user_id INT NOT NULL,
  request_key VARCHAR(80) NOT NULL,
  payload_hash CHAR(64) NOT NULL,
  payload_json JSON NOT NULL,
  disposition VARCHAR(32) NOT NULL,
  state VARCHAR(32) NOT NULL DEFAULT 'prepared',
  recipient_email VARCHAR(320) NOT NULL,
  reply_to_email VARCHAR(320) NOT NULL,
  communication_id INT NULL,
  internet_message_id VARCHAR(255) NULL,
  external_message_id VARCHAR(255) NULL,
  sent_at DATETIME NULL,
  status_applied_at DATETIME NULL,
  reopened_at DATETIME NULL,
  reply_message_id VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_enrollment_followup_request (client_id, request_key),
  INDEX idx_enrollment_followup_reply (internet_message_id),
  INDEX idx_enrollment_followup_client (client_id, state),
  CONSTRAINT fk_enrollment_followup_client FOREIGN KEY (client_id) REFERENCES clients(id),
  CONSTRAINT fk_enrollment_followup_actor FOREIGN KEY (created_by_user_id) REFERENCES users(id)
);
