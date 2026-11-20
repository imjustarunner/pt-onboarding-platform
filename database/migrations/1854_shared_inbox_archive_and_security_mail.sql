CREATE TABLE IF NOT EXISTS shared_inbox_ticket_archives (
  id CHAR(36) PRIMARY KEY,
  conversation_id INT NOT NULL,
  ticket_id INT NOT NULL,
  actor_user_id INT NOT NULL,
  previous_ticket_status VARCHAR(32) NOT NULL,
  previous_conversation_status VARCHAR(32) NOT NULL,
  previous_close_on_read TINYINT NOT NULL,
  last_ticket_message_id INT NOT NULL,
  archived_at DATETIME(6) NOT NULL,
  expires_at DATETIME(6) NOT NULL,
  undone_at DATETIME(6) NULL,
  KEY idx_shared_inbox_archive_conversation (conversation_id, archived_at)
);

CREATE TABLE IF NOT EXISTS account_security_mail_routing (
  id TINYINT PRIMARY KEY,
  starts_at DATETIME(6) NOT NULL
);
INSERT IGNORE INTO account_security_mail_routing (id, starts_at) VALUES (1, UTC_TIMESTAMP(6));

CREATE TABLE IF NOT EXISTS account_security_mail_forwards (
  agency_id INT NOT NULL,
  source_hash CHAR(64) NOT NULL,
  forward_message_id VARCHAR(255) NOT NULL,
  state ENUM('sending','sent','review') NOT NULL DEFAULT 'sending',
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (agency_id, source_hash),
  UNIQUE KEY uq_security_mail_forward_id (forward_message_id)
);
