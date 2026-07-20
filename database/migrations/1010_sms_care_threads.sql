-- Migration 1010: SMS care-thread ownership, number purpose, escalation types

-- Care number purpose (clinical vs appointment verify, etc.)
ALTER TABLE twilio_numbers
  ADD COLUMN number_purpose VARCHAR(40) NOT NULL DEFAULT 'clinical_care'
  COMMENT 'clinical_care | appointment_verify | general';

-- Expand escalation types used by forwarding / ticket escalate flows
ALTER TABLE sms_thread_escalations
  MODIFY COLUMN escalation_type ENUM(
    'sla_timeout',
    'provider_mirror',
    'manual_forward',
    'yes_reply',
    'covert',
    'ticket'
  ) NOT NULL DEFAULT 'sla_timeout';

ALTER TABLE sms_thread_escalations
  ADD COLUMN support_ticket_id INT NULL
  COMMENT 'Linked support desk ticket when SMS was escalated in-app';

-- Per client+number care ownership (CPA-driven)
CREATE TABLE IF NOT EXISTS sms_care_threads (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  number_id INT NULL,
  client_id INT NOT NULL,
  owner_user_id INT NULL COMMENT 'Primary caregiver (CPA) for this SMS thread',
  care_state ENUM('observing', 'under_care', 'escalated', 'closed') NOT NULL DEFAULT 'under_care',
  support_access ENUM('none', 'observe', 'respond') NOT NULL DEFAULT 'observe',
  support_ticket_id INT NULL,
  last_inbound_at TIMESTAMP NULL,
  last_outbound_at TIMESTAMP NULL,
  metadata JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_sms_care_thread (agency_id, client_id, number_id),
  INDEX idx_sms_care_owner (owner_user_id, care_state),
  INDEX idx_sms_care_agency_state (agency_id, care_state),
  CONSTRAINT fk_sms_care_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_sms_care_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  CONSTRAINT fk_sms_care_owner FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
