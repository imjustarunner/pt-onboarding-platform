-- Migration 1326: Communications Quick View foundation
-- Tenant email policy, availability release, sender trust, quick-view credentials, secure-message audit.

-- ---------------------------------------------------------------------------
-- Agency email policy (admin/super_admin adjustable)
-- ---------------------------------------------------------------------------
ALTER TABLE agency_email_settings
  ADD COLUMN personal_email_digest_enabled TINYINT(1) NOT NULL DEFAULT 1
    COMMENT 'Escalate unread to personal_email after business hours',
  ADD COLUMN personal_email_digest_business_hours SMALLINT NOT NULL DEFAULT 24
    COMMENT 'Availability hours before personal-email digest (default 24)',
  ADD COLUMN hold_staff_school_outside_availability TINYINT(1) NOT NULL DEFAULT 1
    COMMENT 'Store immediately but delay employee feed until available',
  ADD COLUMN client_ooo_auto_reply_enabled TINYINT(1) NOT NULL DEFAULT 1,
  ADD COLUMN client_ooo_template TEXT NULL
    COMMENT 'Template; placeholders: {provider_name},{agency_name},{return_at},{support_keyword}',
  ADD COLUMN client_ooo_support_keyword VARCHAR(40)
    CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'SUPPORT',
  ADD COLUMN unknown_sender_box_enabled TINYINT(1) NOT NULL DEFAULT 1,
  ADD COLUMN secure_message_sender_identity_id INT NULL,
  ADD COLUMN noreply_sender_identity_id INT NULL,
  ADD COLUMN intent_review_enabled TINYINT(1) NOT NULL DEFAULT 1,
  ADD COLUMN intent_confidence_threshold DECIMAL(4,2) NOT NULL DEFAULT 0.75,
  ADD COLUMN quick_view_enabled TINYINT(1) NOT NULL DEFAULT 0
    COMMENT 'Feature flag: Quick View for this tenant',
  ADD COLUMN secure_client_message_email_enabled TINYINT(1) NOT NULL DEFAULT 0;

ALTER TABLE user_communication_prefs
  ADD COLUMN availability_hours_enabled TINYINT(1) NOT NULL DEFAULT 1
    COMMENT '0 = always available (no hold/OOO from availability)',
  ADD COLUMN meeting_reminder_bypass_availability TINYINT(1) NOT NULL DEFAULT 1
    COMMENT 'Allow 5-min meeting join reminders outside availability',
  ADD COLUMN digest_business_hours SMALLINT NULL
    COMMENT 'Override agency digest hours; NULL = agency default',
  ADD COLUMN last_personal_forward_at DATETIME NULL;

-- ---------------------------------------------------------------------------
-- Conversation / message policy fields
-- ---------------------------------------------------------------------------
ALTER TABLE communication_conversations
  ADD COLUMN sender_trust ENUM(
      'staff','school_staff','school_contact','client','guardian','contact','unknown','blocked'
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL
    COMMENT 'Classification of primary external sender',
  ADD COLUMN is_unknown_sender TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN visible_after DATETIME NULL
    COMMENT 'NULL = visible now; else hold until this time for employee feed',
  ADD COLUMN released_at DATETIME NULL,
  ADD COLUMN auto_reply_sent_at DATETIME NULL,
  ADD COLUMN intent_kind VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  ADD COLUMN intent_ticket_id INT NULL,
  ADD COLUMN personal_forward_eligible_at DATETIME NULL,
  ADD COLUMN personal_forwarded_at DATETIME NULL,
  ADD INDEX idx_comm_conv_visible_after (visible_after),
  ADD INDEX idx_comm_conv_unknown (agency_id, is_unknown_sender),
  ADD INDEX idx_comm_conv_forward (personal_forwarded_at, personal_forward_eligible_at);

ALTER TABLE communication_messages
  ADD COLUMN is_auto_reply TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN auto_reply_kind VARCHAR(40)
    CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL
    COMMENT 'ooo|support_ack|intent_ack',
  ADD COLUMN read_via VARCHAR(40)
    CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL
    COMMENT 'app|quick_view|secure_portal|email_pixel',
  ADD COLUMN first_read_at DATETIME NULL,
  ADD COLUMN first_read_user_id INT NULL;

-- ---------------------------------------------------------------------------
-- Per-user communication contacts / trust / blocks
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_communication_contacts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  owner_user_id INT NOT NULL,
  email VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  phone VARCHAR(40) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  display_name VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  linked_user_id INT NULL,
  linked_client_id INT NULL,
  linked_entity_type VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  linked_entity_id INT NULL,
  trust_status ENUM('safe','blocked')
    CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'safe',
  source ENUM('manual','outbound','school','staff','client','mark_known')
    CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'manual',
  block_reason VARCHAR(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  blocked_at DATETIME NULL,
  blocked_by_user_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_ucc_owner_email (owner_user_id, agency_id, email),
  INDEX idx_ucc_owner (owner_user_id, trust_status),
  INDEX idx_ucc_agency (agency_id),
  INDEX idx_ucc_linked_user (linked_user_id),
  CONSTRAINT fk_ucc_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_ucc_owner FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_ucc_linked_user FOREIGN KEY (linked_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_ucc_blocked_by FOREIGN KEY (blocked_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Quick View credentials (hash-only; raw token shown once)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_quick_view_credentials (
  user_id INT NOT NULL PRIMARY KEY,
  agency_id INT NULL,
  token_hash CHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL
    COMMENT 'SHA-256 of persistent URL token',
  token_version INT NOT NULL DEFAULT 0,
  token_issued_at DATETIME NULL,
  token_revoked_at DATETIME NULL,
  passcode_hash VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL
    COMMENT 'bcrypt of 6-digit Quick View passcode',
  passcode_version INT NOT NULL DEFAULT 0,
  passcode_set_at DATETIME NULL,
  failed_passcode_attempts INT NOT NULL DEFAULT 0,
  passcode_locked_until DATETIME NULL,
  last_token_used_at DATETIME NULL,
  last_passcode_ok_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_qvc_token_hash (token_hash),
  INDEX idx_qvc_agency (agency_id),
  CONSTRAINT fk_qvc_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_qvc_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS quick_view_sessions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  agency_id INT NULL,
  session_token_hash CHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  credential_token_version INT NOT NULL DEFAULT 0,
  meeting_event_type VARCHAR(40) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL
    COMMENT 'supervision|team_meeting|huddle',
  meeting_event_id INT NULL,
  meeting_ends_at DATETIME NULL,
  expires_at DATETIME NOT NULL,
  last_activity_at DATETIME NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  revoked_at DATETIME NULL,
  UNIQUE KEY uq_qvs_session_hash (session_token_hash),
  INDEX idx_qvs_user (user_id, expires_at),
  CONSTRAINT fk_qvs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS quick_view_access_events (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  agency_id INT NULL,
  event_type VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL
    COMMENT 'token_click|passcode_ok|passcode_fail|session_start|session_expire|regen_token|reset_passcode|meeting_join|message_open',
  resource_type VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  resource_id INT NULL,
  meta_json JSON NULL,
  ip_hash CHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  user_agent VARCHAR(512) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_qvae_user (user_id, created_at),
  INDEX idx_qvae_type (event_type, created_at),
  CONSTRAINT fk_qvae_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Secure client message notification + read audit
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS secure_message_notifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  conversation_id INT NULL,
  chat_thread_id INT NULL,
  message_id INT NULL COMMENT 'chat_messages.id or communication_messages.id',
  message_source ENUM('chat','communication')
    CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'chat',
  sender_user_id INT NOT NULL,
  recipient_user_id INT NULL,
  recipient_email VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  client_id INT NULL,
  notification_token_hash CHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  user_communication_id INT NULL,
  sent_at DATETIME NULL,
  email_opened_at DATETIME NULL,
  first_read_at DATETIME NULL,
  first_read_via VARCHAR(40) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  first_read_user_agent VARCHAR(512) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  first_read_ip_hash CHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_smn_token (notification_token_hash),
  INDEX idx_smn_recipient (recipient_user_id, sent_at),
  INDEX idx_smn_thread (chat_thread_id),
  INDEX idx_smn_conv (conversation_id),
  CONSTRAINT fk_smn_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_smn_sender FOREIGN KEY (sender_user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Intent review tickets linkage (support_tickets already exists)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS communication_intent_reviews (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  conversation_id INT NOT NULL,
  message_id INT NULL,
  intent_kind VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL
    COMMENT 'cancellation|termination',
  confidence DECIMAL(4,2) NOT NULL DEFAULT 0.00,
  status ENUM('pending','accepted','dismissed','auto_ticketed','expired')
    CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  recommended_action VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  excerpt TEXT NULL,
  matched_client_id INT NULL,
  matched_session_ids_json JSON NULL,
  support_ticket_id INT NULL,
  reviewed_by_user_id INT NULL,
  reviewed_at DATETIME NULL,
  auto_action_at DATETIME NULL
    COMMENT 'When 24 business hours elapse without review',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_cir_status (agency_id, status),
  INDEX idx_cir_conv (conversation_id),
  CONSTRAINT fk_cir_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_cir_conv FOREIGN KEY (conversation_id) REFERENCES communication_conversations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
