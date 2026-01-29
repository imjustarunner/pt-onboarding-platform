-- Receivables/Claims: ingest billing reports for A/R workflow (encrypted patient-level fields)

CREATE TABLE IF NOT EXISTS agency_receivables_report_uploads (
  id INT NOT NULL AUTO_INCREMENT,
  agency_id INT NOT NULL,
  uploaded_by_user_id INT NULL,
  original_filename VARCHAR(255) NULL,
  min_service_date DATE NULL,
  max_service_date DATE NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_arru_agency_created (agency_id, created_at),
  CONSTRAINT fk_arru_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_arru_uploaded_by FOREIGN KEY (uploaded_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS agency_receivables_report_rows (
  id BIGINT NOT NULL AUTO_INCREMENT,
  upload_id INT NOT NULL,
  agency_id INT NOT NULL,
  service_date DATE NULL,
  row_fingerprint CHAR(64) NOT NULL,

  -- Encrypted patient name (AES-256-GCM)
  patient_name_ciphertext_b64 TEXT NULL,
  patient_name_iv_b64 VARCHAR(32) NULL,
  patient_name_auth_tag_b64 VARCHAR(32) NULL,
  patient_name_key_id VARCHAR(32) NULL,

  -- Encrypted payer name (insurance/company)
  payer_name_ciphertext_b64 TEXT NULL,
  payer_name_iv_b64 VARCHAR(32) NULL,
  payer_name_auth_tag_b64 VARCHAR(32) NULL,
  payer_name_key_id VARCHAR(32) NULL,

  -- Optional encrypted identifiers if present in future reports
  claim_id_ciphertext_b64 TEXT NULL,
  claim_id_iv_b64 VARCHAR(32) NULL,
  claim_id_auth_tag_b64 VARCHAR(32) NULL,
  claim_id_key_id VARCHAR(32) NULL,

  patient_balance_status VARCHAR(64) NULL,
  row_type VARCHAR(64) NULL,
  payment_type VARCHAR(128) NULL,

  patient_responsibility_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  patient_amount_paid DECIMAL(12,2) NOT NULL DEFAULT 0,
  patient_outstanding_amount DECIMAL(12,2) NOT NULL DEFAULT 0,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uniq_arr_row_fingerprint (agency_id, row_fingerprint),
  KEY idx_arr_rows_upload (upload_id),
  KEY idx_arr_rows_agency_service_date (agency_id, service_date),
  KEY idx_arr_rows_agency_outstanding (agency_id, patient_outstanding_amount),
  CONSTRAINT fk_arr_rows_upload FOREIGN KEY (upload_id) REFERENCES agency_receivables_report_uploads(id) ON DELETE CASCADE,
  CONSTRAINT fk_arr_rows_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS agency_receivables_invoices (
  id BIGINT NOT NULL AUTO_INCREMENT,
  agency_id INT NOT NULL,
  status ENUM('draft','sent','external','closed') NOT NULL DEFAULT 'draft',
  collections_stage VARCHAR(16) NULL,
  external_flag TINYINT(1) NOT NULL DEFAULT 0,
  external_notes TEXT NULL,
  due_date DATE NULL,
  created_by_user_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_ari_agency_status (agency_id, status),
  CONSTRAINT fk_ari_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_ari_created_by FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS agency_receivables_invoice_items (
  id BIGINT NOT NULL AUTO_INCREMENT,
  invoice_id BIGINT NOT NULL,
  report_row_id BIGINT NULL,
  description VARCHAR(255) NULL,
  service_date_start DATE NULL,
  service_date_end DATE NULL,
  amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_arii_invoice (invoice_id),
  CONSTRAINT fk_arii_invoice FOREIGN KEY (invoice_id) REFERENCES agency_receivables_invoices(id) ON DELETE CASCADE,
  CONSTRAINT fk_arii_report_row FOREIGN KEY (report_row_id) REFERENCES agency_receivables_report_rows(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

