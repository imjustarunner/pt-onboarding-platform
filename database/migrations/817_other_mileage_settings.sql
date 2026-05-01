-- Migration 817: add agency settings for Other Mileage reimbursement rates
CREATE TABLE IF NOT EXISTS agency_mileage_settings (
  agency_id INT NOT NULL,
  standard_mileage_rate_per_mile DECIMAL(10,4) NOT NULL DEFAULT 0
    COMMENT 'Flat per-mile reimbursement rate for non-school/Other Mileage claims',
  standard_mileage_uses_tier_rates TINYINT(1) NOT NULL DEFAULT 0
    COMMENT 'When enabled and allowed by agency feature flag, Other Mileage approval uses tier rates instead of the flat rate',
  updated_by_user_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (agency_id),
  CONSTRAINT chk_agency_mileage_settings_standard_rate CHECK (standard_mileage_rate_per_mile >= 0)
);
