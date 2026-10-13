ALTER TABLE payroll_rates MODIFY COLUMN pay_method ENUM('fixed_rate','percent_collected','percent_billed') NULL DEFAULT NULL;
ALTER TABLE payroll_import_rows ADD COLUMN billed_amount DECIMAL(12,2) NULL AFTER client_paid_amount;
CREATE TABLE IF NOT EXISTS payroll_provider_aliases (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  user_id INT NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  created_by_user_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_payroll_alias (agency_id, first_name, last_name),
  INDEX idx_payroll_alias_user (user_id)
);
