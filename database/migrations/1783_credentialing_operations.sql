-- Shared by the platform and AuricWell adapters. No mailboxes are created by migration.
CREATE TABLE IF NOT EXISTS credentialing_payer_documents (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  insurance_definition_id INT NOT NULL,
  document_type VARCHAR(40) NOT NULL,
  title VARCHAR(200) NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  file_size INT UNSIGNED NOT NULL,
  storage_path VARCHAR(512) NOT NULL,
  uploaded_by_user_id INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX credentialing_payer_documents_scope (agency_id, insurance_definition_id)
);

CREATE TABLE IF NOT EXISTS credentialing_reminders (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  subject_type VARCHAR(20) NOT NULL,
  record_id INT NOT NULL,
  title VARCHAR(200) NOT NULL,
  remind_at DATETIME NOT NULL COMMENT 'UTC',
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  created_by_user_id INT NOT NULL,
  delivered_at DATETIME NULL,
  completed_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX credentialing_reminder_scope (agency_id, subject_type, record_id),
  INDEX credentialing_reminder_due (status, remind_at)
);

CREATE TABLE IF NOT EXISTS credentialing_case_emails (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  credential_id INT NOT NULL,
  sender_identity_id INT NOT NULL,
  email_address VARCHAR(254) NOT NULL,
  created_by_user_id INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY credentialing_case_address (email_address),
  UNIQUE KEY credentialing_case_mailbox (agency_id, credential_id)
);

CREATE TABLE IF NOT EXISTS credentialing_email_tickets (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  case_email_id BIGINT UNSIGNED NOT NULL,
  ticket_id INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY credentialing_email_ticket (ticket_id),
  INDEX credentialing_email_case (case_email_id)
);
