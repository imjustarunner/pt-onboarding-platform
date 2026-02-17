-- Persist payroll processor decisions for supervision dual-source conflicts.
-- One resolution applies per provider + service date within a payroll period.

CREATE TABLE IF NOT EXISTS payroll_supervision_conflict_resolutions (
  id INT NOT NULL AUTO_INCREMENT,
  payroll_period_id INT NOT NULL,
  agency_id INT NOT NULL,
  user_id INT NOT NULL,
  service_date DATE NOT NULL,
  resolution ENUM('use_app_attendance','use_legacy_import','ignore') NOT NULL,
  note VARCHAR(255) NULL,
  resolved_by_user_id INT NOT NULL,
  resolved_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_supv_conflict_resolution (payroll_period_id, user_id, service_date),
  KEY idx_supv_conflict_period (payroll_period_id, agency_id),
  KEY idx_supv_conflict_user_date (agency_id, user_id, service_date),
  CONSTRAINT fk_pscr_period FOREIGN KEY (payroll_period_id) REFERENCES payroll_periods(id) ON DELETE CASCADE,
  CONSTRAINT fk_pscr_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_pscr_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_pscr_resolver FOREIGN KEY (resolved_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

