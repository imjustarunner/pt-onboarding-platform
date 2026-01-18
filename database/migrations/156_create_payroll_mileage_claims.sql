-- Migration: Create payroll mileage claims table
-- Description: Provider-submitted mileage claims that can be approved and included in payroll.

CREATE TABLE IF NOT EXISTS payroll_mileage_claims (
  id INT NOT NULL AUTO_INCREMENT,
  agency_id INT NOT NULL,
  user_id INT NOT NULL,

  status VARCHAR(32) NOT NULL DEFAULT 'submitted',

  drive_date DATE NOT NULL,
  miles DECIMAL(10,2) NOT NULL DEFAULT 0,
  round_trip TINYINT(1) NOT NULL DEFAULT 0,
  start_location VARCHAR(255) NULL,
  end_location VARCHAR(255) NULL,
  notes TEXT NULL,
  attestation TINYINT(1) NOT NULL DEFAULT 0,

  -- Derived/suggested association (helps gating & review)
  suggested_payroll_period_id INT NULL,

  -- Approval fields / payroll linkage
  target_payroll_period_id INT NULL,
  tier_level TINYINT NULL,
  rate_per_mile DECIMAL(10,4) NULL,
  applied_amount DECIMAL(12,2) NULL,

  approved_by_user_id INT NULL,
  approved_at DATETIME NULL,
  rejected_by_user_id INT NULL,
  rejected_at DATETIME NULL,
  rejection_reason VARCHAR(255) NULL,

  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  CONSTRAINT chk_payroll_mileage_claims_status CHECK (status IN ('submitted','approved','rejected','deferred','paid')),
  CONSTRAINT chk_payroll_mileage_claims_miles CHECK (miles >= 0),
  CONSTRAINT chk_payroll_mileage_claims_tier CHECK (tier_level IS NULL OR tier_level IN (1,2,3)),
  CONSTRAINT chk_payroll_mileage_claims_rate CHECK (rate_per_mile IS NULL OR rate_per_mile >= 0),
  CONSTRAINT chk_payroll_mileage_claims_amount CHECK (applied_amount IS NULL OR applied_amount >= 0)
);

CREATE INDEX idx_mileage_claims_agency_status
  ON payroll_mileage_claims (agency_id, status);

CREATE INDEX idx_mileage_claims_agency_user_status
  ON payroll_mileage_claims (agency_id, user_id, status);

CREATE INDEX idx_mileage_claims_suggested_period_status
  ON payroll_mileage_claims (suggested_payroll_period_id, status);

CREATE INDEX idx_mileage_claims_target_period_status
  ON payroll_mileage_claims (target_payroll_period_id, status);

