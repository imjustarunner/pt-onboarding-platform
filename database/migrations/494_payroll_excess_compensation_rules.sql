-- Migration: Payroll excess compensation rules (service-code-based equivalency)
-- Description: Master reference table for excess time compensation logic per service code.
-- Total Included Span = direct_service_included_max + admin_included_max (computed).
-- Excess = time submitted beyond the included span, paid at direct/indirect rates.

CREATE TABLE IF NOT EXISTS payroll_excess_compensation_rules (
  id INT NOT NULL AUTO_INCREMENT,
  agency_id INT NOT NULL,
  service_code VARCHAR(64) NOT NULL,

  -- Direct Service Minimum (CPT minimum standard, minutes)
  direct_service_minimum INT NOT NULL DEFAULT 0,

  -- Direct Service Included Maximum (Practice operational cap, minutes)
  direct_service_included_max INT NOT NULL DEFAULT 0,

  -- Included Administrative Time Maximum (minutes)
  admin_included_max INT NOT NULL DEFAULT 0,

  -- Credit Value (for tier/credits calculation)
  credit_value DECIMAL(18,6) NOT NULL DEFAULT 0,

  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uq_excess_rule_agency_code (agency_id, service_code),
  INDEX idx_excess_rule_agency (agency_id),

  CONSTRAINT fk_excess_rule_agency FOREIGN KEY (agency_id) REFERENCES agencies (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
