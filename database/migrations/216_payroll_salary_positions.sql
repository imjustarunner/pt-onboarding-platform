-- Payroll: salary positions (true salary pay, with optional proration and optional add-on service pay)
-- Used to automatically apply salary pay each pay period for selected providers.

CREATE TABLE IF NOT EXISTS payroll_salary_positions (
  id INT NOT NULL AUTO_INCREMENT,
  agency_id INT NOT NULL,
  user_id INT NOT NULL,
  salary_per_pay_period DECIMAL(12,2) NOT NULL DEFAULT 0,
  include_service_pay TINYINT(1) NOT NULL DEFAULT 0,
  prorate_by_days TINYINT(1) NOT NULL DEFAULT 1,
  effective_start DATE NULL,
  effective_end DATE NULL,
  created_by_user_id INT NOT NULL,
  updated_by_user_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_agency_user_effective (agency_id, user_id, effective_start, effective_end),
  KEY idx_agency_user (agency_id, user_id),
  KEY idx_effective (effective_start, effective_end),
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

