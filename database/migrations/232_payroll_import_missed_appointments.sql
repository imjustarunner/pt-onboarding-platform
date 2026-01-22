-- Payroll: flagged missed appointments from billing report import
-- Display-only: used to surface rows where:
-- - Type contains "Missed Appointment" (column B in some billing exports)
-- - Patient Balance Status contains "Paid in Full" (column AG)
-- - We store clinician name (column N) and patient amount paid (column AE)

CREATE TABLE IF NOT EXISTS payroll_import_missed_appointments (
  id INT NOT NULL AUTO_INCREMENT,
  payroll_import_id INT NOT NULL,
  payroll_period_id INT NOT NULL,
  agency_id INT NOT NULL,
  clinician_name VARCHAR(160) NOT NULL,
  patient_amount_paid DECIMAL(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_import (payroll_import_id),
  KEY idx_period (payroll_period_id),
  KEY idx_agency (agency_id),
  KEY idx_clinician (clinician_name),
  CONSTRAINT fk_pima_import FOREIGN KEY (payroll_import_id) REFERENCES payroll_imports(id) ON DELETE CASCADE,
  CONSTRAINT fk_pima_period FOREIGN KEY (payroll_period_id) REFERENCES payroll_periods(id) ON DELETE CASCADE,
  CONSTRAINT fk_pima_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

