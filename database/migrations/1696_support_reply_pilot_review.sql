-- Immutable, encrypted evidence for the supervised support-email pilot.
ALTER TABLE communication_messages MODIFY COLUMN send_status
  ENUM('sent', 'scheduled', 'sending', 'cancelled', 'failed', 'preparing', 'received', 'recorded', 'unverified', 'queued')
  NOT NULL DEFAULT 'sent';

ALTER TABLE support_ticket_attachments
  ADD COLUMN support_ticket_message_id INT NULL,
  ADD KEY idx_ticket_attachment_message (ticket_id, support_ticket_message_id);

CREATE TABLE IF NOT EXISTS support_reply_pilot_config (
  agency_id INT NOT NULL PRIMARY KEY,
  reviewer_user_id INT NOT NULL,
  pilot_user_ids_json JSON NOT NULL,
  time_zone VARCHAR(100) NOT NULL DEFAULT 'America/Denver',
  send_time CHAR(5) NOT NULL DEFAULT '18:00',
  weekdays_only BOOLEAN NOT NULL DEFAULT TRUE,
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS support_reply_review_snapshots (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  ticket_id INT NOT NULL,
  snapshot_kind VARCHAR(24) NOT NULL,
  actor_user_id INT NULL,
  draft_snapshot_id BIGINT NULL,
  ticket_message_id INT NULL,
  source_message_id VARCHAR(255) NULL,
  thread_revision VARCHAR(100) NULL,
  delivery_status VARCHAR(24) NULL,
  transport_message_id VARCHAR(998) NULL,
  communication_id INT NULL,
  model_name VARCHAR(150) NULL,
  provider_name VARCHAR(100) NULL,
  error_code VARCHAR(100) NULL,
  request_key CHAR(64) NOT NULL,
  payload_encrypted MEDIUMTEXT NOT NULL,
  occurred_at DATETIME(3) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_support_review_request (agency_id, request_key),
  KEY idx_support_review_day (agency_id, occurred_at, actor_user_id),
  KEY idx_support_review_ticket (ticket_id, id),
  KEY idx_support_review_draft (draft_snapshot_id)
);

CREATE TABLE IF NOT EXISTS support_ticket_email_messages (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  ticket_id INT NOT NULL,
  ticket_message_id INT NOT NULL,
  agency_id INT NOT NULL,
  direction VARCHAR(16) NOT NULL,
  send_status VARCHAR(24) NOT NULL,
  sender_identity_id INT NULL,
  from_email VARCHAR(255) NULL,
  from_name VARCHAR(255) NULL,
  to_json JSON NULL,
  cc_json JSON NULL,
  subject VARCHAR(998) NULL,
  internet_message_id VARCHAR(998) NULL,
  internet_message_id_hash CHAR(64) NULL,
  in_reply_to VARCHAR(998) NULL,
  references_header TEXT NULL,
  gmail_message_id VARCHAR(255) NULL,
  gmail_thread_id VARCHAR(255) NULL,
  communication_id INT NULL,
  client_request_key CHAR(64) NULL,
  draft_snapshot_id BIGINT NULL,
  error_code VARCHAR(100) NULL,
  error_message VARCHAR(500) NULL,
  sent_at DATETIME(3) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_support_email_message (ticket_message_id),
  UNIQUE KEY uq_support_email_internet_id (agency_id, internet_message_id_hash),
  UNIQUE KEY uq_support_email_request (ticket_id, client_request_key),
  KEY idx_support_email_thread (agency_id, gmail_thread_id),
  KEY idx_support_email_pending (send_status, communication_id),
  KEY idx_support_email_ticket (ticket_id, id)
);

CREATE TABLE IF NOT EXISTS support_reply_review_digests (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  reviewer_user_id INT NOT NULL,
  local_date DATE NOT NULL,
  time_zone VARCHAR(100) NOT NULL,
  window_start DATETIME(3) NOT NULL,
  window_end DATETIME(3) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'pending',
  notification_id INT NULL,
  communication_id INT NULL,
  transport_message_id VARCHAR(998) NULL,
  counts_json JSON NULL,
  error_code VARCHAR(100) NULL,
  claimed_at DATETIME(3) NULL,
  claim_token CHAR(36) NULL,
  attempted_at DATETIME(3) NULL,
  completed_at DATETIME(3) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_support_review_digest_day (agency_id, local_date),
  KEY idx_support_review_digest_status (status, created_at)
);

CREATE TABLE IF NOT EXISTS support_ticket_email_thread_sync (
  agency_id INT NOT NULL,
  gmail_thread_id VARCHAR(255) NOT NULL,
  canonical_ticket_id INT NULL,
  last_checked_at DATETIME NULL,
  last_error_code VARCHAR(100) NULL,
  PRIMARY KEY (agency_id, gmail_thread_id),
  KEY idx_support_thread_canonical_ticket (canonical_ticket_id)
);

-- Requested initial pilot: Rachel reviews Hannah and Loriana at ITSCO.
-- No mail is sent by this migration. The scheduler runs only after deployment.
INSERT INTO support_reply_pilot_config
  (agency_id, reviewer_user_id, pilot_user_ids_json, time_zone, send_time, weekdays_only, is_enabled)
SELECT a.id, r.id, JSON_ARRAY(h.id, l.id), 'America/Denver', '18:00', TRUE, TRUE
FROM agencies a JOIN users r ON r.id = 507 JOIN users h ON h.id = 559 JOIN users l ON l.id = 555
JOIN user_agencies ra ON ra.agency_id = a.id AND ra.user_id = r.id AND ra.is_active = TRUE
JOIN user_agencies ha ON ha.agency_id = a.id AND ha.user_id = h.id AND ha.is_active = TRUE
JOIN user_agencies la ON la.agency_id = a.id AND la.user_id = l.id AND la.is_active = TRUE
WHERE a.id = 2 AND r.is_active = TRUE AND h.is_active = TRUE AND l.is_active = TRUE
  AND LOWER(TRIM(r.email)) = 'rachel@itsco.health'
  AND LOWER(TRIM(h.email)) = 'hannah@plottwistco.com'
  AND LOWER(TRIM(l.email)) = 'loriana@itsco.health'
ON DUPLICATE KEY UPDATE agency_id = VALUES(agency_id);
