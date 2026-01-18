-- Migration: Create payroll reimbursement claims
-- Description: Provider-submitted reimbursement requests with receipt upload; approved claims roll into payroll adjustments.

CREATE TABLE IF NOT EXISTS payroll_reimbursement_claims (
  id INT NOT NULL AUTO_INCREMENT,
  agency_id INT NOT NULL,
  user_id INT NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'submitted', -- submitted|approved|rejected|deferred|paid

  expense_date DATE NOT NULL,
  amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  vendor VARCHAR(255) NULL,
  category VARCHAR(64) NULL,
  notes TEXT NULL,
  attestation TINYINT(1) NOT NULL DEFAULT 0,

  receipt_file_path VARCHAR(512) NULL,
  receipt_original_name VARCHAR(255) NULL,
  receipt_mime_type VARCHAR(128) NULL,
  receipt_size_bytes INT NULL,

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
  INDEX idx_reimb_agency_status (agency_id, status),
  INDEX idx_reimb_user (agency_id, user_id, created_at),
  INDEX idx_reimb_target_period (agency_id, target_payroll_period_id, status),

  CONSTRAINT fk_reimb_agency_id FOREIGN KEY (agency_id) REFERENCES agencies (id) ON DELETE CASCADE,
  CONSTRAINT fk_reimb_user_id FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_reimb_suggested_period_id FOREIGN KEY (suggested_payroll_period_id) REFERENCES payroll_periods (id) ON DELETE SET NULL,
  CONSTRAINT fk_reimb_target_period_id FOREIGN KEY (target_payroll_period_id) REFERENCES payroll_periods (id) ON DELETE SET NULL,
  CONSTRAINT fk_reimb_approved_by_user_id FOREIGN KEY (approved_by_user_id) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_reimb_rejected_by_user_id FOREIGN KEY (rejected_by_user_id) REFERENCES users (id) ON DELETE SET NULL
);

