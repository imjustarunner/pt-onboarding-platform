-- Migration 1011: SMS number purpose roles + encrypted profile audit trail

-- Expand purpose vocabulary (VARCHAR already; document allowed values via comment)
ALTER TABLE twilio_numbers
  MODIFY COLUMN number_purpose VARCHAR(40) NOT NULL DEFAULT 'clinical_care'
  COMMENT 'platform_contact | tenant_contact | clinical_care | notification | appointment_verify | provider_contact | general';

-- Map legacy appointment_verify into notification family (keep value for back-compat reads)
UPDATE twilio_numbers
SET number_purpose = 'notification'
WHERE number_purpose = 'appointment_verify';

CREATE TABLE IF NOT EXISTS sms_profile_audit (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NULL COMMENT 'NULL for platform_contact numbers',
  client_id INT NULL,
  user_id INT NULL COMMENT 'Guardian or other user whose profile phone matched',
  direction ENUM('INBOUND', 'OUTBOUND') NOT NULL,
  from_number VARCHAR(32) NULL,
  to_number VARCHAR(32) NULL,
  number_id INT NULL,
  number_purpose VARCHAR(40) NULL,
  body_ciphertext TEXT NULL,
  body_iv VARCHAR(64) NULL,
  body_auth_tag VARCHAR(64) NULL,
  encryption_key_id VARCHAR(64) NULL,
  message_log_id INT NULL,
  notification_sms_log_id INT NULL,
  occurred_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_sms_audit_client_time (client_id, occurred_at),
  INDEX idx_sms_audit_user_time (user_id, occurred_at),
  INDEX idx_sms_audit_agency_time (agency_id, occurred_at),
  INDEX idx_sms_audit_message_log (message_log_id),
  CONSTRAINT fk_sms_audit_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE SET NULL,
  CONSTRAINT fk_sms_audit_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL,
  CONSTRAINT fk_sms_audit_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
