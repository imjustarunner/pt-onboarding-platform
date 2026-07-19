-- Migration 981: Unified booking cancellation policies + waiver audit (Phase 3)

CREATE TABLE IF NOT EXISTS booking_cancellation_policies (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  agency_id INT NOT NULL,
  name VARCHAR(200) NOT NULL,
  description TEXT NULL,
  scope_level ENUM(
    'affiliation',
    'tenant',
    'business_type',
    'service',
    'package',
    'appointment'
  ) NOT NULL DEFAULT 'tenant',
  business_type VARCHAR(64) NULL DEFAULT NULL,
  tenant_service_id INT UNSIGNED NULL DEFAULT NULL,
  booking_package_id INT UNSIGNED NULL DEFAULT NULL,
  notice_hours INT NOT NULL DEFAULT 24
    COMMENT 'Hours before start_at for free / timely cancel',
  late_fee_cents INT NOT NULL DEFAULT 0,
  late_package_action ENUM('release', 'forfeit', 'review') NOT NULL DEFAULT 'forfeit'
    COMMENT 'Package credit effect when canceling after notice window',
  complimentary_cancels_per_period INT NOT NULL DEFAULT 0,
  period_days INT NOT NULL DEFAULT 90,
  allow_client_cancel TINYINT(1) NOT NULL DEFAULT 1,
  require_reason TINYINT(1) NOT NULL DEFAULT 1,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  created_by_user_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_bcp_agency (agency_id, is_active, scope_level),
  KEY idx_bcp_service (tenant_service_id),
  KEY idx_bcp_package (booking_package_id),
  CONSTRAINT fk_bcp_agency
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE appointments
  ADD COLUMN cancellation_policy_id INT UNSIGNED NULL DEFAULT NULL
    COMMENT 'Resolved/override policy at book or cancel time'
    AFTER package_entitlement_id,
  ADD COLUMN cancel_deadline_at DATETIME NULL DEFAULT NULL
    COMMENT 'Computed from notice_hours relative to start_at'
    AFTER cancellation_policy_id,
  ADD COLUMN cancellation_reason VARCHAR(500) NULL DEFAULT NULL
    AFTER cancel_deadline_at,
  ADD COLUMN cancellation_fee_cents INT NULL DEFAULT NULL
    AFTER cancellation_reason,
  ADD COLUMN cancellation_recommendation_json JSON NULL
    COMMENT 'Snapshot of evaluateCancel result at cancel time'
    AFTER cancellation_fee_cents,
  ADD COLUMN canceled_at DATETIME NULL DEFAULT NULL
    AFTER cancellation_recommendation_json,
  ADD COLUMN canceled_by_user_id INT NULL DEFAULT NULL
    AFTER canceled_at;

CREATE TABLE IF NOT EXISTS booking_cancellation_waivers (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  agency_id INT NOT NULL,
  appointment_id INT UNSIGNED NOT NULL,
  policy_id INT UNSIGNED NULL DEFAULT NULL,
  waived_fee_cents INT NOT NULL DEFAULT 0,
  package_action_overridden VARCHAR(32) NULL DEFAULT NULL
    COMMENT 'release|forfeit|review when staff overrides policy',
  reason VARCHAR(500) NOT NULL,
  waived_by_user_id INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_bcw_appointment (appointment_id),
  KEY idx_bcw_agency (agency_id, created_at),
  CONSTRAINT fk_bcw_agency
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_bcw_appointment
    FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
