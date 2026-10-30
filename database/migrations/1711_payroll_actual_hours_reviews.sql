-- Append-only reviewer attestations; does not populate or change existing payroll.
CREATE TABLE IF NOT EXISTS payroll_actual_hours_reviews (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  agency_id INT NOT NULL,
  payroll_period_id INT NOT NULL,
  user_id INT NOT NULL,
  actual_worked_hours DECIMAL(12,6) NOT NULL,
  statutory_sick_basis_hours DECIMAL(12,6) NOT NULL,
  source_reference VARCHAR(500) NOT NULL,
  reconciliation_note TEXT NOT NULL,
  summary_fingerprint CHAR(64) NOT NULL,
  supersedes_review_id BIGINT NULL,
  reviewed_by_user_id INT NOT NULL,
  reviewed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_actual_hours_period_user (agency_id,payroll_period_id,user_id,id),
  CHECK(actual_worked_hours >= 0 AND statutory_sick_basis_hours >= actual_worked_hours)
) ENGINE=InnoDB;
