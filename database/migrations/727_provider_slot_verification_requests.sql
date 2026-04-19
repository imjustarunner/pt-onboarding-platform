-- Migration: Provider Slot Verification Requests
-- Purpose:
-- - Lets school portal admin/super_admin/staff/support PUSH a slot-verification
--   request to a specific provider for a given school organization.
-- - Provider's response (Confirm or Request Changes) closes the row and
--   notifies back to admins/staff/support (per product spec).
-- - Used by the school portal weekly-availability splash to bypass the once-per-week
--   localStorage gate when a pending request exists.

CREATE TABLE IF NOT EXISTS provider_slot_verification_requests (
  id INT NOT NULL AUTO_INCREMENT,
  school_organization_id INT NOT NULL,
  agency_id INT NOT NULL,
  provider_user_id INT NOT NULL,
  requested_by_user_id INT NOT NULL,
  requested_by_role VARCHAR(64) NULL,
  message VARCHAR(1000) NULL,
  status ENUM('PENDING','CONFIRMED','CHANGES_REQUESTED','CANCELLED') NOT NULL DEFAULT 'PENDING',
  responded_at DATETIME NULL,
  response_kind ENUM('confirmed','changes_requested') NULL,
  response_school_request_id INT NULL,
  response_summary VARCHAR(2000) NULL,
  cancelled_at DATETIME NULL,
  cancelled_by_user_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_psvr_school_status (school_organization_id, status, created_at),
  INDEX idx_psvr_provider_status (provider_user_id, status, created_at),
  INDEX idx_psvr_pending_lookup (school_organization_id, provider_user_id, status),
  INDEX idx_psvr_agency_status (agency_id, status),
  CONSTRAINT fk_psvr_provider
    FOREIGN KEY (provider_user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_psvr_requested_by
    FOREIGN KEY (requested_by_user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_psvr_cancelled_by
    FOREIGN KEY (cancelled_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_psvr_agency
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_psvr_school
    FOREIGN KEY (school_organization_id) REFERENCES agencies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Email trigger registry rows so unifiedEmailSender can resolve a sender identity
-- for the new notification types (kept disabled by default for email — admins can opt in).
INSERT INTO notification_triggers
  (trigger_key, name, description, default_enabled, default_channels_json, default_recipients_json)
VALUES
  (
    'school_provider_slot_verification_requested',
    'Slot verification requested',
    'School portal admin/staff pushed a slot verification to a provider.',
    1,
    JSON_OBJECT('inApp', TRUE, 'sms', TRUE, 'email', TRUE),
    JSON_OBJECT('provider', TRUE, 'supervisor', FALSE, 'clinicalPracticeAssistant', FALSE, 'admin', FALSE)
  ),
  (
    'school_provider_slot_verification_completed',
    'Slot verification completed',
    'Provider responded to a pushed slot verification (confirmed or requested changes).',
    1,
    JSON_OBJECT('inApp', TRUE, 'sms', FALSE, 'email', FALSE),
    JSON_OBJECT('provider', FALSE, 'supervisor', FALSE, 'clinicalPracticeAssistant', FALSE, 'admin', TRUE)
  )
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  description = VALUES(description),
  default_enabled = VALUES(default_enabled),
  default_channels_json = VALUES(default_channels_json),
  default_recipients_json = VALUES(default_recipients_json);
