-- Per-user rate-sheet visibility toggles (do not affect agency-wide defaults).
CREATE TABLE IF NOT EXISTS payroll_user_rate_sheet_visibility (
  id INT NOT NULL AUTO_INCREMENT,
  agency_id INT NOT NULL,
  user_id INT NOT NULL,
  service_code VARCHAR(64) NOT NULL,
  show_in_rate_sheet TINYINT(1) NOT NULL DEFAULT 1,
  updated_by_user_id INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payroll_user_rate_sheet_visibility (agency_id, user_id, service_code),
  KEY idx_payroll_user_rate_sheet_visibility_user (agency_id, user_id),
  CONSTRAINT fk_payroll_user_rate_sheet_visibility_agency
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

