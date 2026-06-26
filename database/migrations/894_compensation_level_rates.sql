-- Migration 894: Per-code rates attached to each compensation level
-- When FFS is enabled for a level, specific service codes can have their own rates.
-- These are applied to payroll_rates when a level is assigned to a provider.
CREATE TABLE payroll_compensation_level_rates (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  agency_id    INT           NOT NULL,
  category     TINYINT       NOT NULL COMMENT '1-3',
  level        TINYINT       NOT NULL COMMENT '1-5',
  service_code VARCHAR(20)   NOT NULL,
  rate_amount  DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  rate_unit    ENUM('per_unit','per_hour','flat') NOT NULL DEFAULT 'per_unit',
  updated_at   TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_agency_cat_level_code (agency_id, category, level, service_code)
);
