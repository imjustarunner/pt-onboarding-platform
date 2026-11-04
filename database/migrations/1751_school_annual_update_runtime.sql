-- Migration1751: install annual school-update runtime tables when absent.
-- Schema only: preserve existing rules, follow-ups and delivery receipts.
-- No seeds, activation, replay or backfill.
CREATE TABLE IF NOT EXISTS school_reinit_rules (
  agency_id INT NOT NULL PRIMARY KEY,
  enabled TINYINT(1) NOT NULL DEFAULT 0,
  timezone VARCHAR(64) NOT NULL DEFAULT 'America/Denver',
  opens_md CHAR(5) NOT NULL DEFAULT '08-01',
  due_md CHAR(5) NOT NULL DEFAULT '08-21',
  followup_md CHAR(5) NOT NULL DEFAULT '08-31',
  activated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by_user_id INT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS school_reinit_deliveries (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  school_year VARCHAR(16) NOT NULL,
  school_organization_id INT NOT NULL DEFAULT 0,
  cycle_id INT NULL,
  delivery_key VARCHAR(100) NOT NULL,
  kind VARCHAR(32) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'pending',
  recipient_email TEXT NULL,
  communication_id INT NULL,
  message_id VARCHAR(255) NULL,
  last_error VARCHAR(500) NULL,
  sent_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_reinit_delivery (agency_id,school_year,school_organization_id,delivery_key),
  KEY idx_reinit_delivery_status (status,updated_at)
);
CREATE TABLE IF NOT EXISTS school_reinit_followups (
  cycle_id INT NOT NULL PRIMARY KEY,
  status VARCHAR(24) NOT NULL DEFAULT 'open',
  outstanding_json JSON NOT NULL,
  extension_until DATE NULL,
  resolution_note TEXT NULL,
  updated_by_user_id INT NULL,
  opened_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at DATETIME NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
