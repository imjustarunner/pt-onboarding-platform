-- Migration: Payroll adjustments + richer summary fields
-- Description: Supports add-ons/overrides and tier/hour fields needed for dashboards.

ALTER TABLE payroll_summaries
  ADD COLUMN no_note_units DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER user_id,
  ADD COLUMN draft_units DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER no_note_units,
  ADD COLUMN finalized_units DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER draft_units,
  ADD COLUMN tier_credits_current DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER finalized_units,
  ADD COLUMN tier_credits_prior DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER tier_credits_current,
  ADD COLUMN tier_credits_final DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER tier_credits_prior,
  ADD COLUMN grace_active TINYINT(1) NOT NULL DEFAULT 0 AFTER tier_credits_final,
  ADD COLUMN total_hours DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER grace_active,
  ADD COLUMN direct_hours DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER total_hours,
  ADD COLUMN indirect_hours DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER direct_hours;

CREATE TABLE IF NOT EXISTS payroll_adjustments (
  payroll_period_id INT NOT NULL,
  agency_id INT NOT NULL,
  user_id INT NOT NULL,
  mileage_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  other_taxable_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  bonus_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  reimbursement_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  salary_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  pto_hours DECIMAL(12,2) NOT NULL DEFAULT 0,
  pto_rate DECIMAL(12,2) NOT NULL DEFAULT 0,
  updated_by_user_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (payroll_period_id, user_id),
  FOREIGN KEY (payroll_period_id) REFERENCES payroll_periods(id) ON DELETE CASCADE,
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  INDEX idx_adjustments_agency (agency_id),
  INDEX idx_adjustments_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

