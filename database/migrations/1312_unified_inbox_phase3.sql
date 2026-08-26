-- Migration 1312: Unified Inbox Phase 3 — channel sync keys, scheduled/undo send, spam blocklist

ALTER TABLE communication_conversations
  ADD COLUMN is_spam TINYINT(1) NOT NULL DEFAULT 0
    COMMENT 'Marked as spam; usually archived'
    AFTER starred,
  ADD INDEX idx_comm_conv_external (agency_id, external_thread_id),
  ADD INDEX idx_comm_conv_spam (is_spam);

ALTER TABLE communication_messages
  ADD COLUMN send_status ENUM('sent', 'scheduled', 'cancelled', 'failed')
    CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    NOT NULL DEFAULT 'sent'
    COMMENT 'Outbound delivery state for schedule/undo'
    AFTER is_internal_note,
  ADD COLUMN scheduled_send_at DATETIME NULL
    COMMENT 'When scheduled outbound should actually send'
    AFTER send_status,
  ADD COLUMN undo_expires_at DATETIME NULL
    COMMENT 'Soft undo window after send (client UX)'
    AFTER scheduled_send_at,
  ADD INDEX idx_comm_msg_scheduled (send_status, scheduled_send_at);

CREATE TABLE IF NOT EXISTS communication_blocked_addresses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  address VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL
    COMMENT 'Email or E.164 phone',
  address_kind ENUM('email', 'phone')
    CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    NOT NULL DEFAULT 'email',
  reason VARCHAR(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  created_by_user_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_comm_block_agency_addr (agency_id, address_kind, address),
  INDEX idx_comm_block_agency (agency_id),
  CONSTRAINT fk_comm_block_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_comm_block_user FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
