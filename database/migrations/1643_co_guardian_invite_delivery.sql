-- Delivery attempts belong to the invitation, never to a browser-supplied account.
CREATE TABLE co_guardian_invite_deliveries (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  invite_id INT NOT NULL,
  enrollment_channel VARCHAR(40) NULL,
  recipient_email VARCHAR(255) NOT NULL,
  communication_id INT NULL,
  internet_message_id VARCHAR(255) NULL,
  delivery_status VARCHAR(24) NOT NULL DEFAULT 'sending',
  failure_kind VARCHAR(32) NULL,
  parent_notice_status VARCHAR(24) NULL,
  parent_notice_communication_id INT NULL,
  parent_notice_attempted_at DATETIME NULL,
  staff_ticket_created_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_guardian_delivery_invite (invite_id, id),
  KEY idx_guardian_delivery_communication (communication_id),
  KEY idx_guardian_delivery_message (internet_message_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE co_guardian_delivery_reports (
  gmail_message_id VARCHAR(128) NOT NULL PRIMARY KEY,
  checked_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
