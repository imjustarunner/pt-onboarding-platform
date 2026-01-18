-- Migration: Payroll rate templates
-- Description: Store reusable pay rate templates (rate card + per-service-code rates) that can be applied to users.

CREATE TABLE IF NOT EXISTS payroll_rate_templates (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  name VARCHAR(128) NOT NULL,
  is_variable TINYINT(1) NOT NULL DEFAULT 0,
  direct_rate DECIMAL(12,4) NOT NULL DEFAULT 0,
  indirect_rate DECIMAL(12,4) NOT NULL DEFAULT 0,
  other_rate_1 DECIMAL(12,4) NOT NULL DEFAULT 0,
  other_rate_2 DECIMAL(12,4) NOT NULL DEFAULT 0,
  other_rate_3 DECIMAL(12,4) NOT NULL DEFAULT 0,
  created_by_user_id INT NOT NULL,
  updated_by_user_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_rate_template_name (agency_id, name),
  INDEX idx_rate_templates_agency (agency_id),
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payroll_rate_template_rates (
  id INT AUTO_INCREMENT PRIMARY KEY,
  template_id INT NOT NULL,
  agency_id INT NOT NULL,
  service_code VARCHAR(64) NOT NULL,
  rate_amount DECIMAL(12,4) NOT NULL DEFAULT 0,
  rate_unit ENUM('per_unit','flat') NOT NULL DEFAULT 'per_unit',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_template_code (template_id, service_code),
  INDEX idx_template_rates_template (template_id),
  INDEX idx_template_rates_agency (agency_id),
  FOREIGN KEY (template_id) REFERENCES payroll_rate_templates(id) ON DELETE CASCADE,
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

