-- Payroll: manual pay lines (per pay period, per provider)
-- Used for one-off payroll corrections that should be included in Run Payroll and Posted Payroll.

CREATE TABLE IF NOT EXISTS payroll_manual_pay_lines (
  id INT NOT NULL AUTO_INCREMENT,
  payroll_period_id INT NOT NULL,
  agency_id INT NOT NULL,
  user_id INT NOT NULL,
  label VARCHAR(128) NOT NULL,
  amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  created_by_user_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_period (payroll_period_id),
  KEY idx_agency (agency_id),
  KEY idx_user (user_id),
  FOREIGN KEY (payroll_period_id) REFERENCES payroll_periods(id) ON DELETE CASCADE,
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

