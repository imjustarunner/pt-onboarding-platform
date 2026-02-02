-- Migration: Agency Holidays + Holiday Pay Policy + Holiday Bonus Claims
-- Description:
-- 1) Store explicit agency holiday dates
-- 2) Store agency-level holiday pay policy (% + notification toggles) as JSON
-- 3) Create system-generated holiday bonus claims for payroll approval workflow
-- 4) Seed a notification trigger for "holiday pay assessed but no approval identified"

-- 1) Explicit agency holidays (YYYY-MM-DD)
CREATE TABLE IF NOT EXISTS agency_holidays (
  id INT NOT NULL AUTO_INCREMENT,
  agency_id INT NOT NULL,
  holiday_date DATE NOT NULL,
  name VARCHAR(128) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_agency_holiday_date (agency_id, holiday_date),
  INDEX idx_agency_holidays_agency_date (agency_id, holiday_date),
  CONSTRAINT fk_agency_holidays_agency_id FOREIGN KEY (agency_id) REFERENCES agencies (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2) Holiday pay policy stored on agencies (JSON)
-- Shape (normalized in service layer):
--   { percentage: number, notifyMissingApproval: boolean, notifyStrictMessage: boolean }
ALTER TABLE agencies
  ADD COLUMN holiday_pay_policy_json JSON NULL;

-- 3) System-generated holiday bonus claims (one per provider per pay period)
CREATE TABLE IF NOT EXISTS payroll_holiday_bonus_claims (
  id INT NOT NULL AUTO_INCREMENT,
  agency_id INT NOT NULL,
  user_id INT NOT NULL,
  payroll_period_id INT NOT NULL,

  status VARCHAR(32) NOT NULL DEFAULT 'submitted', -- submitted|approved|rejected

  holiday_bonus_percent DECIMAL(6,2) NOT NULL DEFAULT 0,
  base_service_pay_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  applied_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  holiday_dates_json JSON NULL,

  approved_by_user_id INT NULL,
  approved_at TIMESTAMP NULL,

  rejection_reason VARCHAR(255) NULL,
  rejected_by_user_id INT NULL,
  rejected_at TIMESTAMP NULL,

  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uq_holiday_bonus_claim (agency_id, user_id, payroll_period_id),
  INDEX idx_holiday_bonus_claims_status (agency_id, status, payroll_period_id),
  INDEX idx_holiday_bonus_claims_user (agency_id, user_id, payroll_period_id),

  CONSTRAINT fk_holiday_bonus_claims_agency_id FOREIGN KEY (agency_id) REFERENCES agencies (id) ON DELETE CASCADE,
  CONSTRAINT fk_holiday_bonus_claims_user_id FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_holiday_bonus_claims_payroll_period_id FOREIGN KEY (payroll_period_id) REFERENCES payroll_periods (id) ON DELETE CASCADE,
  CONSTRAINT fk_holiday_bonus_claims_approved_by_user_id FOREIGN KEY (approved_by_user_id) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_holiday_bonus_claims_rejected_by_user_id FOREIGN KEY (rejected_by_user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4) Notification trigger seed (default OFF, agency can enable)
INSERT INTO notification_triggers
  (trigger_key, name, description, default_enabled, default_channels_json, default_recipients_json, default_sender_identity_id)
VALUES
  (
    'payroll_holiday_bonus_missing_approval',
    'Holiday pay assessed but no approval recorded',
    'Alerts when payable services occurred on configured holiday dates and holiday bonus approval has not been completed.',
    0,
    JSON_OBJECT('inApp', TRUE, 'sms', FALSE, 'email', FALSE),
    JSON_OBJECT('provider', FALSE, 'supervisor', TRUE, 'clinicalPracticeAssistant', FALSE, 'admin', TRUE),
    NULL
  )
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  description = VALUES(description),
  default_enabled = VALUES(default_enabled),
  default_channels_json = VALUES(default_channels_json),
  default_recipients_json = VALUES(default_recipients_json),
  default_sender_identity_id = VALUES(default_sender_identity_id);

