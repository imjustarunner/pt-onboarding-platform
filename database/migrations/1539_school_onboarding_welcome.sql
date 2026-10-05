-- Future completion events only: do not email historical schools during deployment.
CREATE TABLE IF NOT EXISTS school_onboarding_welcome_emails (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  school_organization_id INT NOT NULL,
  source_type VARCHAR(32) NOT NULL,
  source_id INT NOT NULL,
  delivery_status VARCHAR(24) NOT NULL DEFAULT 'pending',
  recipient_email VARCHAR(255) NULL,
  communication_id INT NULL,
  last_error VARCHAR(500) NULL,
  attempts INT NOT NULL DEFAULT 0,
  next_attempt_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_school_welcome (agency_id, school_organization_id),
  KEY idx_school_welcome_pending (delivery_status, next_attempt_at)
);
-- Separate receipt per inbound email prevents duplicate replies within a ticket.
CREATE TABLE IF NOT EXISTS technology_ticket_email_receipts (
  agency_id INT NOT NULL,
  message_id VARCHAR(255) NOT NULL,
  ticket_id INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (agency_id, message_id),
  KEY idx_technology_ticket_receipts (ticket_id)
);

-- Technology must resolve to its department identity, including reply-all mail.
INSERT INTO email_inbound_routes (sender_identity_id, email_address, is_active)
SELECT id, LOWER(from_email), TRUE FROM email_sender_identities
WHERE identity_key='technology' AND is_active=TRUE AND LOWER(from_email) LIKE 'technology@%'
ON DUPLICATE KEY UPDATE sender_identity_id=VALUES(sender_identity_id), is_active=TRUE;
