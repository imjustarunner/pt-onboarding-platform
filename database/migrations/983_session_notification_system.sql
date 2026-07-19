-- Migration 983: Fully customizable session notification system
-- Platform floors → tenant channels/rules → client prefs → deliveries + buffered push updates

CREATE TABLE IF NOT EXISTS platform_session_notification_settings (
  id TINYINT UNSIGNED NOT NULL DEFAULT 1,
  channels_json JSON NOT NULL
    COMMENT '{"in_app":"available","email":"available","sms":"consent_required","phone":"disabled"}',
  min_rules_json JSON NOT NULL
    COMMENT 'Required floors e.g. [{kind:"standard_reminder",offsetValue:24,offsetUnit:"hours",channel:"email",required:true}]',
  default_buffer_minutes INT NOT NULL DEFAULT 15,
  allow_tenant_disable_json JSON NULL
    COMMENT 'Which channels tenants may turn off; false = locked on when platform available',
  updated_by_user_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO platform_session_notification_settings (id, channels_json, min_rules_json, default_buffer_minutes, allow_tenant_disable_json)
VALUES (
  1,
  CAST('{"in_app":"available","email":"available","sms":"consent_required","phone":"disabled"}' AS JSON),
  CAST('[{"kind":"standard_reminder","offsetValue":24,"offsetUnit":"hours","channel":"email","required":true,"label":"Platform minimum 24h email"}]' AS JSON),
  15,
  CAST('{"in_app":true,"email":false,"sms":true,"phone":true}' AS JSON)
)
ON DUPLICATE KEY UPDATE id = id;

CREATE TABLE IF NOT EXISTS agency_session_notification_settings (
  agency_id INT NOT NULL,
  channels_enabled_json JSON NOT NULL
    COMMENT '{"in_app":true,"email":true,"sms":false,"phone":false}',
  booking_confirmation_json JSON NULL
    COMMENT '{enabled,channels,requireResponse,templateKey,message}',
  standard_reminder_json JSON NULL
    COMMENT '{enabled,offsetValue,offsetUnit,channels,required,templateKey,message}',
  additional_reminders_json JSON NULL
    COMMENT '[{id,label,offsetValue,offsetUnit,channel,recipient,templateKey,askConfirmation,enabled}]',
  change_notify_json JSON NULL
    COMMENT '{enabled,bufferMinutes,channels,respectUserOptOut}',
  message_templates_json JSON NULL,
  updated_by_user_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (agency_id),
  CONSTRAINT fk_asns_agency
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS client_session_notification_preferences (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  agency_id INT NOT NULL,
  client_id INT NOT NULL,
  guardian_user_id INT NOT NULL DEFAULT 0
    COMMENT '0 = client-level prefs; else guardian user id',
  channels_json JSON NOT NULL
    COMMENT '{"in_app":true,"email":true,"sms":false,"phone":false}',
  reminder_lead_json JSON NULL
    COMMENT 'Optional earlier/later preference {offsetValue,offsetUnit} for optional reminders',
  optional_reminders_enabled TINYINT(1) NOT NULL DEFAULT 1,
  confirmation_requests_enabled TINYINT(1) NOT NULL DEFAULT 1,
  provider_pushed_updates_enabled TINYINT(1) NOT NULL DEFAULT 1
    COMMENT 'Send me session changes and important updates',
  scheduling_changes_enabled TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_csnp_client_guardian (agency_id, client_id, guardian_user_id),
  KEY idx_csnp_client (client_id),
  CONSTRAINT fk_csnp_agency
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Extend Phase 4 reminder rows with rule metadata
ALTER TABLE appointment_reminders
  ADD COLUMN kind VARCHAR(64) NOT NULL DEFAULT 'reminder'
    COMMENT 'confirmation|standard_reminder|additional_reminder|change_update|other'
    AFTER channel,
  ADD COLUMN rule_key VARCHAR(64) NULL DEFAULT NULL
    AFTER kind,
  ADD COLUMN recipient_role VARCHAR(32) NOT NULL DEFAULT 'client'
    COMMENT 'client|guardian|provider|billing'
    AFTER rule_key,
  ADD COLUMN requires_confirmation TINYINT(1) NOT NULL DEFAULT 0
    AFTER recipient_role,
  ADD COLUMN template_key VARCHAR(64) NULL DEFAULT NULL
    AFTER requires_confirmation,
  ADD COLUMN is_required TINYINT(1) NOT NULL DEFAULT 0
    COMMENT '1 = platform/tenant minimum; user prefs cannot suppress'
    AFTER template_key,
  ADD COLUMN message_body TEXT NULL
    AFTER is_required;

CREATE TABLE IF NOT EXISTS appointment_change_notification_queue (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  appointment_id INT UNSIGNED NOT NULL,
  agency_id INT NOT NULL,
  fire_at DATETIME NOT NULL,
  buffer_minutes INT NOT NULL DEFAULT 15,
  status ENUM('pending', 'sending', 'sent', 'canceled') NOT NULL DEFAULT 'pending',
  changes_json JSON NOT NULL
    COMMENT '[{field,from,to,at,actorUserId}]',
  channels_json JSON NULL
    COMMENT 'Channels selected for this push',
  message_override TEXT NULL,
  preview_json JSON NULL
    COMMENT 'Cached preview: recipients, channel availability, opt-out flags',
  created_by_user_id INT NULL,
  sent_at DATETIME NULL,
  canceled_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_acnq_due (status, fire_at),
  KEY idx_acnq_appointment (appointment_id, status),
  CONSTRAINT fk_acnq_appointment
    FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE,
  CONSTRAINT fk_acnq_agency
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Durable client consent columns used by SMS/phone session notifications
ALTER TABLE clients
  ADD COLUMN session_email_opt_in TINYINT(1) NULL DEFAULT NULL
    COMMENT 'NULL=unknown/legacy; 1=opted in; 0=opted out',
  ADD COLUMN session_sms_opt_in TINYINT(1) NULL DEFAULT NULL
    COMMENT 'NULL=unknown; 1=opted in for scheduling SMS; 0=opted out',
  ADD COLUMN session_phone_opt_in TINYINT(1) NULL DEFAULT NULL
    COMMENT 'NULL=unknown; 1=opted in for automated voice; 0=opted out';
