CREATE TABLE IF NOT EXISTS payroll_recurring_payments (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  user_id INT NOT NULL,
  label VARCHAR(110) NOT NULL,
  request_key VARCHAR(80) NOT NULL,
  UNIQUE KEY uniq_recurring_request (agency_id,request_key),
  cadence ENUM('once','weekly','biweekly','monthly') NOT NULL,
  starts_on DATE NOT NULL,
  ends_on DATE NULL,
  amount DECIMAL(12,2) NOT NULL,
  minutes DECIMAL(9,2) NOT NULL DEFAULT 0,
  hourly_rate DECIMAL(10,2) NULL,
  created_by_user_id INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_recurring_agency_user (agency_id,user_id)
);
CREATE TABLE IF NOT EXISTS payroll_recurring_occurrences (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  recurring_payment_id INT NOT NULL,
  occurrence_date DATE NOT NULL,
  payroll_period_id INT NOT NULL,
  manual_pay_line_id INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_recurring_date (recurring_payment_id,occurrence_date)
);
ALTER TABLE payroll_time_claims ADD COLUMN employee_archived_at DATETIME NULL;
