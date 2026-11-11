-- One durable automatic email attempt per payroll posting, plus explicit resends.
-- The exact CSV snapshot is retained encrypted for later email approval/retry.
CREATE TABLE IF NOT EXISTS payroll_report_email_deliveries (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  payroll_period_id INT NOT NULL,
  delivery_key VARCHAR(112) NOT NULL,
  trigger_type VARCHAR(16) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'preparing',
  requested_by_user_id INT NULL,
  sender_identity_id INT NULL,
  recipient_email VARCHAR(255) NULL,
  attachment_filename VARCHAR(255) NULL,
  attachment_sha256 CHAR(64) NULL,
  attachment_payload_enc LONGTEXT NULL,
  communication_id INT NULL,
  message_id VARCHAR(255) NULL,
  error_code VARCHAR(64) NULL,
  sent_at DATETIME(3) NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_payroll_report_email_attempt (agency_id,payroll_period_id,delivery_key),
  KEY idx_payroll_report_email_period (agency_id,payroll_period_id,id),
  CONSTRAINT fk_payroll_report_email_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_payroll_report_email_period FOREIGN KEY (payroll_period_id) REFERENCES payroll_periods(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
