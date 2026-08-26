-- Migration 1310: Unified Communications Center inbox (Phase 1)
-- Conversation store for email (+ future channels), shared inboxes, workflow fields,
-- and linkage to support_tickets for the ticket-email adapter.

CREATE TABLE IF NOT EXISTS communication_inboxes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NULL COMMENT 'NULL = platform-wide shared inbox',
  sender_identity_id INT NULL COMMENT 'FK to email_sender_identities for From/signature',
  kind ENUM('personal', 'shared') NOT NULL DEFAULT 'shared',
  identity_key VARCHAR(100) NULL COMMENT 'Stable key mirrored from sender identity when seeded',
  display_name VARCHAR(255) NOT NULL,
  from_email VARCHAR(255) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_comm_inbox_agency_identity (agency_id, identity_key),
  INDEX idx_comm_inbox_agency (agency_id),
  INDEX idx_comm_inbox_from (from_email),
  CONSTRAINT fk_comm_inbox_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_comm_inbox_sender FOREIGN KEY (sender_identity_id) REFERENCES email_sender_identities(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS communication_inbox_members (
  id INT AUTO_INCREMENT PRIMARY KEY,
  inbox_id INT NOT NULL,
  user_id INT NOT NULL,
  role ENUM('owner', 'member', 'readonly') NOT NULL DEFAULT 'member',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_comm_inbox_member (inbox_id, user_id),
  INDEX idx_comm_inbox_member_user (user_id),
  CONSTRAINT fk_comm_inbox_member_inbox FOREIGN KEY (inbox_id) REFERENCES communication_inboxes(id) ON DELETE CASCADE,
  CONSTRAINT fk_comm_inbox_member_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS communication_conversations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NULL,
  inbox_id INT NULL,
  channel ENUM('email', 'secure', 'sms', 'call', 'voicemail', 'internal', 'mention') NOT NULL DEFAULT 'email',
  subject VARCHAR(500) NULL,
  status ENUM('new', 'needs_reply', 'waiting_on_them', 'follow_up', 'resolved') NOT NULL DEFAULT 'new',
  priority ENUM('low', 'normal', 'high', 'urgent') NOT NULL DEFAULT 'normal',
  owner_user_id INT NULL,
  due_at DATETIME NULL,
  snoozed_until DATETIME NULL,
  starred TINYINT(1) NOT NULL DEFAULT 0,
  archived_at DATETIME NULL,
  support_ticket_id INT NULL COMMENT 'Adapter link to support_tickets email threads',
  draft_body MEDIUMTEXT NULL,
  draft_updated_at DATETIME NULL,
  last_message_at DATETIME NULL,
  last_message_preview VARCHAR(500) NULL,
  external_thread_id VARCHAR(255) NULL COMMENT 'Gmail thread id or equivalent',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_comm_conv_ticket (support_ticket_id),
  INDEX idx_comm_conv_agency_status (agency_id, status),
  INDEX idx_comm_conv_inbox (inbox_id),
  INDEX idx_comm_conv_owner (owner_user_id),
  INDEX idx_comm_conv_snooze (snoozed_until),
  INDEX idx_comm_conv_last_msg (last_message_at),
  INDEX idx_comm_conv_channel (channel),
  CONSTRAINT fk_comm_conv_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_comm_conv_inbox FOREIGN KEY (inbox_id) REFERENCES communication_inboxes(id) ON DELETE SET NULL,
  CONSTRAINT fk_comm_conv_owner FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_comm_conv_ticket FOREIGN KEY (support_ticket_id) REFERENCES support_tickets(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS communication_participants (
  id INT AUTO_INCREMENT PRIMARY KEY,
  conversation_id INT NOT NULL,
  kind ENUM('email', 'user', 'client', 'guardian', 'school_contact', 'employee', 'other') NOT NULL DEFAULT 'email',
  email VARCHAR(255) NULL,
  display_name VARCHAR(255) NULL,
  linked_entity_type VARCHAR(64) NULL,
  linked_entity_id INT NULL,
  is_primary TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_comm_part_conv (conversation_id),
  INDEX idx_comm_part_email (email),
  INDEX idx_comm_part_linked (linked_entity_type, linked_entity_id),
  CONSTRAINT fk_comm_part_conv FOREIGN KEY (conversation_id) REFERENCES communication_conversations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS communication_messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  conversation_id INT NOT NULL,
  channel ENUM('email', 'secure', 'sms', 'call', 'voicemail', 'internal', 'mention') NOT NULL DEFAULT 'email',
  direction ENUM('inbound', 'outbound', 'internal') NOT NULL DEFAULT 'inbound',
  author_user_id INT NULL,
  from_json JSON NULL,
  to_json JSON NULL,
  cc_json JSON NULL,
  bcc_json JSON NULL,
  subject VARCHAR(500) NULL,
  body_text MEDIUMTEXT NULL,
  body_html MEDIUMTEXT NULL,
  internet_message_id VARCHAR(255) NULL,
  in_reply_to VARCHAR(255) NULL,
  references_header TEXT NULL,
  is_internal_note TINYINT(1) NOT NULL DEFAULT 0,
  support_ticket_message_id INT NULL,
  sent_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_comm_msg_conv (conversation_id, created_at),
  INDEX idx_comm_msg_msgid (internet_message_id),
  CONSTRAINT fk_comm_msg_conv FOREIGN KEY (conversation_id) REFERENCES communication_conversations(id) ON DELETE CASCADE,
  CONSTRAINT fk_comm_msg_author FOREIGN KEY (author_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS communication_attachments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  message_id INT NOT NULL,
  filename VARCHAR(255) NOT NULL,
  content_type VARCHAR(128) NULL,
  size_bytes INT NULL,
  storage_key VARCHAR(512) NULL,
  storage_url VARCHAR(1024) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_comm_attach_msg (message_id),
  CONSTRAINT fk_comm_attach_msg FOREIGN KEY (message_id) REFERENCES communication_messages(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS communication_links (
  id INT AUTO_INCREMENT PRIMARY KEY,
  conversation_id INT NOT NULL,
  entity_type VARCHAR(64) NOT NULL COMMENT 'client|school|guardian|provider|referral|task|ticket',
  entity_id INT NOT NULL,
  label VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_comm_link (conversation_id, entity_type, entity_id),
  INDEX idx_comm_link_entity (entity_type, entity_id),
  CONSTRAINT fk_comm_link_conv FOREIGN KEY (conversation_id) REFERENCES communication_conversations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS communication_conversation_reads (
  conversation_id INT NOT NULL,
  user_id INT NOT NULL,
  last_read_at DATETIME NOT NULL,
  PRIMARY KEY (conversation_id, user_id),
  CONSTRAINT fk_comm_read_conv FOREIGN KEY (conversation_id) REFERENCES communication_conversations(id) ON DELETE CASCADE,
  CONSTRAINT fk_comm_read_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed shared inboxes from active email sender identities (agency-scoped).
INSERT INTO communication_inboxes (agency_id, sender_identity_id, kind, identity_key, display_name, from_email, is_active)
SELECT
  esi.agency_id,
  esi.id,
  'shared',
  esi.identity_key,
  COALESCE(NULLIF(TRIM(esi.display_name), ''), esi.identity_key, esi.from_email),
  esi.from_email,
  1
FROM email_sender_identities esi
WHERE esi.is_active = 1
  AND esi.agency_id IS NOT NULL
ON DUPLICATE KEY UPDATE
  sender_identity_id = VALUES(sender_identity_id),
  display_name = VALUES(display_name),
  from_email = VALUES(from_email),
  is_active = 1,
  updated_at = CURRENT_TIMESTAMP;
