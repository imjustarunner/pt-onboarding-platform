-- Platform Revenue Reports (platform-level only)
-- Stores uploaded revenue totals per agency for reporting/rollups.

CREATE TABLE IF NOT EXISTS platform_revenue_report_uploads (
  id INT NOT NULL AUTO_INCREMENT,
  uploaded_by_user_id INT NULL,
  original_filename VARCHAR(255) NULL,
  report_label VARCHAR(255) NULL,
  report_date DATE NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_uploaded_by_user_id (uploaded_by_user_id),
  KEY idx_report_date (report_date)
);

CREATE TABLE IF NOT EXISTS platform_revenue_report_rows (
  id INT NOT NULL AUTO_INCREMENT,
  upload_id INT NOT NULL,
  agency_id INT NULL,
  agency_name VARCHAR(255) NULL,
  period_start DATE NULL,
  period_end DATE NULL,
  managed_total DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  collected_total DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  outstanding_total DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  gross_charges_total DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_platform_revenue_rows_upload
    FOREIGN KEY (upload_id) REFERENCES platform_revenue_report_uploads(id)
    ON DELETE CASCADE,
  KEY idx_upload_id (upload_id),
  KEY idx_agency_id (agency_id),
  KEY idx_period (period_start, period_end)
);

