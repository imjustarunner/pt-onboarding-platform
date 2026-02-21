-- Migration: Create contact_communication_logs
-- Description: Encrypted logs of all communications with contacts (SMS, email, push).

CREATE TABLE IF NOT EXISTS contact_communication_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  contact_id INT NOT NULL,
  channel ENUM('email', 'sms', 'push') NOT NULL,
  direction ENUM('inbound', 'outbound') NOT NULL,
  body_encrypted TEXT NULL,
  encryption_iv_b64 VARCHAR(256) NULL,
  encryption_auth_tag_b64 VARCHAR(256) NULL,
  encryption_key_id VARCHAR(64) NULL,
  external_ref_id VARCHAR(64) NULL,
  metadata JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_contact_comm_logs_contact (contact_id),
  INDEX idx_contact_comm_logs_created (contact_id, created_at),
  INDEX idx_contact_comm_logs_external (external_ref_id),
  FOREIGN KEY (contact_id) REFERENCES agency_contacts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
