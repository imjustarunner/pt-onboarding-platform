-- Migration: Create agency_fiscal_years and department_budget_allocations for Budget Management
-- Description: Fiscal year budgets and department allocations.

CREATE TABLE IF NOT EXISTS agency_fiscal_years (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  fiscal_year_start DATE NOT NULL,
  fiscal_year_end DATE NOT NULL,
  total_operating_budget DECIMAL(14, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_agency_fiscal_year (agency_id, fiscal_year_start),
  INDEX idx_agency_fiscal_years_agency (agency_id),
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS department_budget_allocations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  department_id INT NOT NULL,
  fiscal_year_id INT NOT NULL,
  allocated_amount DECIMAL(14, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_department_fiscal_year (department_id, fiscal_year_id),
  INDEX idx_department_allocations_fiscal (fiscal_year_id),
  FOREIGN KEY (department_id) REFERENCES agency_departments(id) ON DELETE CASCADE,
  FOREIGN KEY (fiscal_year_id) REFERENCES agency_fiscal_years(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
