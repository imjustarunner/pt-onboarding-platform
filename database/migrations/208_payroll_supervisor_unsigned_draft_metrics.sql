-- Track per-pay-period counts of draft notes that were submitted by supervisees
-- but not signed by supervisors (note_status='DRAFT' and draft_payable=1).

CREATE TABLE IF NOT EXISTS payroll_supervisor_unsigned_draft_metrics (
  id INT NOT NULL AUTO_INCREMENT,
  agency_id INT NOT NULL,
  payroll_period_id INT NOT NULL,
  supervisor_user_id INT NOT NULL,
  unsigned_draft_count INT NOT NULL DEFAULT 0,
  notified_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_agency_period_supervisor (agency_id, payroll_period_id, supervisor_user_id),
  KEY idx_agency_period (agency_id, payroll_period_id),
  KEY idx_supervisor (supervisor_user_id)
);

