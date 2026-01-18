-- Migration: Create payroll time claims
-- Description: Provider-submitted time claims (Module 3) with approval workflow; approved claims roll into payroll totals.

CREATE TABLE IF NOT EXISTS payroll_time_claims (
  id INT NOT NULL AUTO_INCREMENT,
  agency_id INT NOT NULL,
  user_id INT NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'submitted', -- submitted|approved|rejected|deferred|paid

  claim_type VARCHAR(32) NOT NULL, -- meeting_training|excess_holiday|service_correction|overtime_evaluation
  claim_date DATE NOT NULL,
  payload_json JSON NOT NULL,

  suggested_payroll_period_id INT NULL,
  target_payroll_period_id INT NULL,

  applied_amount DECIMAL(12,2) NULL,
  approved_by_user_id INT NULL,
  approved_at TIMESTAMP NULL,

  rejection_reason VARCHAR(255) NULL,
  rejected_by_user_id INT NULL,
  rejected_at TIMESTAMP NULL,

  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  INDEX idx_time_agency_status (agency_id, status),
  INDEX idx_time_user (agency_id, user_id, created_at),
  INDEX idx_time_type_date (agency_id, claim_type, claim_date),
  INDEX idx_time_target_period (agency_id, target_payroll_period_id, status),

  CONSTRAINT fk_time_agency_id FOREIGN KEY (agency_id) REFERENCES agencies (id) ON DELETE CASCADE,
  CONSTRAINT fk_time_user_id FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_time_suggested_period_id FOREIGN KEY (suggested_payroll_period_id) REFERENCES payroll_periods (id) ON DELETE SET NULL,
  CONSTRAINT fk_time_target_period_id FOREIGN KEY (target_payroll_period_id) REFERENCES payroll_periods (id) ON DELETE SET NULL,
  CONSTRAINT fk_time_approved_by_user_id FOREIGN KEY (approved_by_user_id) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_time_rejected_by_user_id FOREIGN KEY (rejected_by_user_id) REFERENCES users (id) ON DELETE SET NULL
);

