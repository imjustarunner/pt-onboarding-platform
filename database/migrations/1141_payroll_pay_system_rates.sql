-- Migration 1141: New pay system rate matrix (category x level)
-- Defines credit, H-code, indirect, support-activity, and probationary rates
-- plus configurable tier and Spanish-speaking bonuses per category/level.

CREATE TABLE payroll_pay_system_rates (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  category TINYINT NOT NULL COMMENT '1=Unlicensed, 2=Pre-licensed, 3=Licensed',
  level TINYINT NOT NULL COMMENT '1-5',
  credit_rate DECIMAL(10,2) NULL DEFAULT NULL COMMENT 'Standard $/credit (1 credit = 1 hour equivalent)',
  credit_rate_probation DECIMAL(10,2) NULL DEFAULT NULL COMMENT 'Probationary/MWR $/credit',
  hcode_rate DECIMAL(10,2) NULL DEFAULT NULL COMMENT 'Standard $/hour (or per 4 units) for H-codes',
  hcode_rate_probation DECIMAL(10,2) NULL DEFAULT NULL COMMENT 'Probationary/MWR $/hour for H-codes',
  indirect_rate DECIMAL(10,2) NULL DEFAULT NULL COMMENT 'Hourly indirect rate (also used for auto-indirect)',
  support_activity_rate DECIMAL(10,2) NULL DEFAULT NULL COMMENT 'Hourly support activity / meeting rate',
  auto_indirect_minutes_per_hour INT NOT NULL DEFAULT 10
    COMMENT 'Minutes of auto-indirect added per hour (or 4 units) of H-code work; categories 2/3 only',
  tier_bonus_json JSON NULL
    COMMENT 'e.g. {"1":0,"2":2,"3":4} dollars per hour-equivalent by tier',
  spanish_bonus_json JSON NULL
    COMMENT 'e.g. {"1":0,"2":2,"3":4} dollars per hour-equivalent by tier for Spanish-eligible staff',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_agency_cat_level (agency_id, category, level),
  KEY idx_agency (agency_id)
);
