-- Explicit payroll approval is separate from signing an employment agreement.
CREATE TABLE IF NOT EXISTS payroll_compensation_authorizations (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  user_id INT NOT NULL,
  contract_generation_id INT NOT NULL,
  effective_start DATE NOT NULL,
  approved_by_user_id INT NOT NULL,
  approved_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reason TEXT NOT NULL,
  snapshot_json JSON NOT NULL,
  revoked_at TIMESTAMP NULL DEFAULT NULL,
  UNIQUE KEY uq_payroll_compensation_authorization (agency_id, user_id, contract_generation_id, effective_start),
  KEY idx_payroll_compensation_effective (agency_id, user_id, effective_start)
);

CREATE TABLE IF NOT EXISTS payroll_period_salary_authorizations (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  payroll_period_id INT NOT NULL,
  user_id INT NOT NULL,
  salary_position_id INT NOT NULL,
  salary_amount DECIMAL(12,2) NOT NULL,
  approved_by_user_id INT NOT NULL,
  approved_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reason TEXT NOT NULL,
  revoked_at TIMESTAMP NULL DEFAULT NULL,
  UNIQUE KEY uq_period_salary_authorization (agency_id, payroll_period_id, user_id)
);
