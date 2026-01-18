-- Migration: Payroll rate cards + service code rules
-- Description: Enables multi-rate structures (direct/indirect/other slots) and DB-driven service code classification.

CREATE TABLE IF NOT EXISTS payroll_service_code_rules (
  agency_id INT NOT NULL,
  service_code VARCHAR(64) NOT NULL,
  category ENUM('direct','indirect','other') NOT NULL DEFAULT 'direct',
  other_slot INT NOT NULL DEFAULT 1,
  unit_to_hour_multiplier DECIMAL(12,4) NOT NULL DEFAULT 1.0000,
  counts_for_tier TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (agency_id, service_code),
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  INDEX idx_service_code_rules_category (agency_id, category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payroll_rate_cards (
  agency_id INT NOT NULL,
  user_id INT NOT NULL,
  direct_rate DECIMAL(12,4) NOT NULL DEFAULT 0,
  indirect_rate DECIMAL(12,4) NOT NULL DEFAULT 0,
  other_rate_1 DECIMAL(12,4) NOT NULL DEFAULT 0,
  other_rate_2 DECIMAL(12,4) NOT NULL DEFAULT 0,
  other_rate_3 DECIMAL(12,4) NOT NULL DEFAULT 0,
  updated_by_user_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (agency_id, user_id),
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  INDEX idx_rate_cards_agency (agency_id),
  INDEX idx_rate_cards_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

