-- Migration: Create payroll MedCancel claims table
-- Description: Provider-submitted missed Medicaid session claims (MedCancel) that can be approved and included in payroll.

CREATE TABLE IF NOT EXISTS payroll_medcancel_claims (
  id INT NOT NULL AUTO_INCREMENT,
  agency_id INT NOT NULL,
  user_id INT NOT NULL,

  status VARCHAR(32) NOT NULL DEFAULT 'submitted',

  claim_date DATE NOT NULL,
  school_organization_id INT NULL,

  units DECIMAL(12,2) NOT NULL DEFAULT 0,
  notes TEXT NULL,
  attestation TINYINT(1) NOT NULL DEFAULT 0,

  -- Derived/suggested association (helps gating & review)
  suggested_payroll_period_id INT NULL,

  -- Approval fields / payroll linkage
  target_payroll_period_id INT NULL,
  service_code VARCHAR(64) NULL,
  rate_amount DECIMAL(12,4) NULL,
  rate_unit VARCHAR(32) NULL,
  applied_amount DECIMAL(12,2) NULL,

  approved_by_user_id INT NULL,
  approved_at DATETIME NULL,
  rejected_by_user_id INT NULL,
  rejected_at DATETIME NULL,
  rejection_reason VARCHAR(255) NULL,

  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  CONSTRAINT chk_payroll_medcancel_claims_status CHECK (status IN ('submitted','approved','rejected','deferred','paid')),
  CONSTRAINT chk_payroll_medcancel_claims_units CHECK (units >= 0),
  CONSTRAINT chk_payroll_medcancel_claims_amount CHECK (applied_amount IS NULL OR applied_amount >= 0)
);

CREATE INDEX idx_medcancel_claims_agency_status
  ON payroll_medcancel_claims (agency_id, status);

CREATE INDEX idx_medcancel_claims_agency_user_status
  ON payroll_medcancel_claims (agency_id, user_id, status);

CREATE INDEX idx_medcancel_claims_school
  ON payroll_medcancel_claims (school_organization_id);

CREATE INDEX idx_medcancel_claims_suggested_period_status
  ON payroll_medcancel_claims (suggested_payroll_period_id, status);

CREATE INDEX idx_medcancel_claims_target_period_status
  ON payroll_medcancel_claims (target_payroll_period_id, status);

