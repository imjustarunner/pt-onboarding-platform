-- Explicit grants only: administrators select verified accounts and company parameters.
CREATE TABLE accountability_grants (
  agency_id INT NOT NULL,
  user_id INT NOT NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  settings_json JSON NOT NULL,
  updated_by INT NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (agency_id, user_id),
  FOREIGN KEY (agency_id) REFERENCES agencies(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE accountability_reports (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  user_id INT NOT NULL,
  report_month CHAR(7) NOT NULL,
  status ENUM('draft','signed') NOT NULL DEFAULT 'draft',
  version INT NOT NULL DEFAULT 1,
  data_json JSON NOT NULL,
  snapshot_json JSON NULL,
  pdf_key VARCHAR(500) NULL,
  signed_at DATETIME NULL,
  delivery_status ENUM('not_sent','sending','sent','failed','unknown','queued','redirected') NOT NULL DEFAULT 'not_sent',
  delivery_detail VARCHAR(500) NULL,
  sent_at DATETIME NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_accountability_month (agency_id,user_id,report_month),
  FOREIGN KEY (agency_id) REFERENCES agencies(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE accountability_receipts (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  report_id INT NOT NULL,
  expense_id VARCHAR(36) NOT NULL,
  storage_key VARCHAR(500) NOT NULL,
  original_name VARCHAR(200) NOT NULL,
  mime_type VARCHAR(50) NOT NULL,
  size_bytes INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (report_id) REFERENCES accountability_reports(id),
  KEY ix_accountability_receipts (report_id,expense_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
