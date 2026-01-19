-- Migration: Email sender identities + notification email rules (matrix)
-- Description:
-- 1) Store per-agency (and platform-default) email sender identities: from_name/from_email/reply_to + inbound routing addresses.
-- 2) Store notification email routing rules that select which sender identity to use per notification type,
--    with agency override and optional training_track scoping (for "program"/track-specific notifications).

CREATE TABLE IF NOT EXISTS email_sender_identities (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NULL COMMENT 'NULL = platform default',
  identity_key VARCHAR(100) NOT NULL COMMENT 'Stable key, e.g. default_notifications, payroll, support',
  display_name VARCHAR(255) NULL COMMENT 'From name',
  from_email VARCHAR(255) NOT NULL COMMENT 'From email address (Gmail Send-as alias on impersonated mailbox)',
  reply_to VARCHAR(255) NULL COMMENT 'Reply-To address (often a Google Group)',
  inbound_addresses_json JSON NULL COMMENT 'List of addresses that route inbound mail to this identity (To/Cc matching)',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY uniq_agency_identity_key (agency_id, identity_key),
  INDEX idx_agency_id (agency_id),
  INDEX idx_from_email (from_email),
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS email_inbound_routes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sender_identity_id INT NOT NULL,
  email_address VARCHAR(255) NOT NULL COMMENT 'Inbound address used to route an incoming email (To/Cc)',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY uniq_inbound_email (email_address),
  INDEX idx_sender_identity_id (sender_identity_id),
  FOREIGN KEY (sender_identity_id) REFERENCES email_sender_identities(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notification_email_rules (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NULL COMMENT 'NULL = platform default',
  notification_type VARCHAR(100) NOT NULL COMMENT 'Matches notifications.type',
  training_track_id INT NULL COMMENT 'Optional scoping to a track (program-equivalent)',
  sender_identity_id INT NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY uniq_rule (agency_id, notification_type, training_track_id),
  INDEX idx_rule_lookup (agency_id, notification_type, training_track_id),
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  FOREIGN KEY (training_track_id) REFERENCES training_tracks(id) ON DELETE CASCADE,
  FOREIGN KEY (sender_identity_id) REFERENCES email_sender_identities(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

