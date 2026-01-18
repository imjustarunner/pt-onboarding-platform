-- Migration: Create agency mileage rates table
-- Description: Per-agency Tier 1/2/3 $/mile reimbursement rates used by payroll mileage claims.

CREATE TABLE IF NOT EXISTS agency_mileage_rates (
  agency_id INT NOT NULL,
  tier_level TINYINT NOT NULL,
  rate_per_mile DECIMAL(10,4) NOT NULL DEFAULT 0,
  updated_by_user_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (agency_id, tier_level),
  CONSTRAINT chk_agency_mileage_rates_tier CHECK (tier_level IN (1,2,3)),
  CONSTRAINT chk_agency_mileage_rates_rate CHECK (rate_per_mile >= 0)
);

CREATE INDEX idx_agency_mileage_rates_agency
  ON agency_mileage_rates (agency_id);

