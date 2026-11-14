CREATE TABLE IF NOT EXISTS session_reminder_defaults (
  agency_id INT NOT NULL,
  user_id INT NOT NULL DEFAULT 0 COMMENT '0: organization default; otherwise the provider’s personal default',
  rules_json JSON NOT NULL,
  updated_by_user_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (agency_id,user_id),
  CONSTRAINT fk_session_reminder_defaults_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS session_notification_email_deliveries (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  appointment_id INT UNSIGNED NOT NULL,
  agency_id INT NOT NULL,
  reminder_id INT UNSIGNED NOT NULL,
  client_id INT NOT NULL,
  guardian_user_id INT NULL,
  affiliation_id INT NULL,
  recipient_hash CHAR(64) NOT NULL,
  internet_message_id VARCHAR(255) NOT NULL,
  communication_id BIGINT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_session_notification_message (internet_message_id),
  UNIQUE KEY uq_session_notification_reminder (reminder_id),
  KEY idx_session_notification_reply (appointment_id,created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS session_notification_email_replies (
  message_hash CHAR(64) NOT NULL PRIMARY KEY,
  appointment_id INT UNSIGNED NOT NULL,
  reminder_id INT UNSIGNED NOT NULL,
  communication_id BIGINT UNSIGNED NULL,
  action_status VARCHAR(24) NOT NULL DEFAULT 'review',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_session_notification_reply_timeline (appointment_id,created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS session_reminder_policy_rebuilds (
  appointment_id INT UNSIGNED NOT NULL PRIMARY KEY,
  status VARCHAR(24) NOT NULL DEFAULT 'pending',
  attempts INT NOT NULL DEFAULT 0,
  error_code VARCHAR(64) NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_reminder_policy_pending (status,appointment_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO session_reminder_policy_rebuilds (appointment_id)
SELECT id FROM appointments WHERE start_at>UTC_TIMESTAMP()
  AND status IN ('scheduled','confirmed','client_confirmed')
  AND COALESCE(product_origin,'')<>'auricwell_ehr';

-- Preserve historical rows while ensuring the new dispatcher cannot send a backlog
-- of reminders for appointments that have already ended.
UPDATE appointment_reminders r JOIN appointments a ON a.id=r.appointment_id
SET r.status='skipped',r.skip_reason='session_ended'
WHERE r.status='pending' AND a.end_at<=UTC_TIMESTAMP()
  AND COALESCE(a.product_origin,'')<>'auricwell_ehr';

-- Replace only the original seeded email floor. Explicit administrator rules remain.
UPDATE platform_session_notification_settings
SET min_rules_json=JSON_ARRAY(),
    allow_tenant_disable_json=JSON_SET(COALESCE(allow_tenant_disable_json,JSON_OBJECT()),'$.email',CAST('true' AS JSON))
WHERE JSON_LENGTH(min_rules_json)=1
  AND JSON_UNQUOTE(JSON_EXTRACT(min_rules_json,'$[0].label'))='Platform minimum 24h email';
