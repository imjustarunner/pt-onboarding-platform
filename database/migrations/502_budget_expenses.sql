-- Migration: Create budget_expenses table for Budget Management expense tracking
-- Description: Stores expenses with department, account, category, business purpose, place, receipt, etc.

CREATE TABLE IF NOT EXISTS budget_expenses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  user_id INT NOT NULL,
  department_id INT NOT NULL,
  account_id INT NOT NULL,
  expense_category_id INT NOT NULL,
  business_purpose_id INT NULL,
  place VARCHAR(255) NOT NULL,
  amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  expense_date DATE NOT NULL,
  vendor VARCHAR(255) NULL,
  notes TEXT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'submitted',

  receipt_file_path VARCHAR(512) NULL,
  receipt_original_name VARCHAR(255) NULL,
  receipt_mime_type VARCHAR(128) NULL,
  receipt_size_bytes INT NULL,

  mileage_legs_json JSON NULL,
  mileage_miles DECIMAL(10,2) NULL,
  mileage_rate DECIMAL(10,4) NULL,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_budget_expenses_agency (agency_id),
  INDEX idx_budget_expenses_user (agency_id, user_id, created_at),
  INDEX idx_budget_expenses_status (agency_id, status),
  INDEX idx_budget_expenses_date (agency_id, expense_date),
  INDEX idx_budget_expenses_department (department_id),
  INDEX idx_budget_expenses_category (expense_category_id),

  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (department_id) REFERENCES agency_departments(id) ON DELETE RESTRICT,
  FOREIGN KEY (account_id) REFERENCES department_accounts(id) ON DELETE RESTRICT,
  FOREIGN KEY (expense_category_id) REFERENCES agency_expense_categories(id) ON DELETE RESTRICT,
  FOREIGN KEY (business_purpose_id) REFERENCES agency_business_purposes(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
