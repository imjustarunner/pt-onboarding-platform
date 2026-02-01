-- Psychotherapy Compliance: ingest billing reports for CPT threshold monitoring (minimal PHI storage)
-- Tracks only psychotherapy-related CPT codes per client/provider within fiscal year (Jul 1–Jun 30).

CREATE TABLE IF NOT EXISTS agency_psychotherapy_report_uploads (
  id INT NOT NULL AUTO_INCREMENT,
  agency_id INT NOT NULL,
  uploaded_by_user_id INT NULL,
  original_filename VARCHAR(255) NULL,
  min_service_date DATE NULL,
  max_service_date DATE NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_apru_agency_created (agency_id, created_at),
  CONSTRAINT fk_apru_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_apru_uploaded_by FOREIGN KEY (uploaded_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS agency_psychotherapy_report_rows (
  id BIGINT NOT NULL AUTO_INCREMENT,
  upload_id INT NOT NULL,
  agency_id INT NOT NULL,
  service_date DATE NOT NULL,
  fiscal_year_start DATE NOT NULL COMMENT 'Fiscal year start (July 1) for this service_date',
  service_code VARCHAR(16) NOT NULL,

  -- Provider (clinician) resolution is best-effort.
  provider_user_id INT NULL,
  provider_name_normalized VARCHAR(128) NULL,

  -- Client match to internal client record is best-effort (name is never stored here).
  client_id INT NULL,
  client_key_hash CHAR(64) NOT NULL COMMENT 'SHA-256 of normalized patient name + agency salt',
  client_abbrev VARCHAR(32) NOT NULL COMMENT 'Display-only abbreviation like AbcDef',

  -- Idempotency (per agency): same row fingerprint should upsert (avoid double counting on re-uploads).
  row_fingerprint CHAR(64) NOT NULL,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uniq_apsr_row_fingerprint (agency_id, row_fingerprint),
  KEY idx_apsr_upload (upload_id),
  KEY idx_apsr_agency_fy (agency_id, fiscal_year_start),
  KEY idx_apsr_provider_fy (provider_user_id, fiscal_year_start),
  KEY idx_apsr_client_fy (client_id, fiscal_year_start),
  KEY idx_apsr_clientkey_fy (agency_id, client_key_hash, fiscal_year_start),
  CONSTRAINT fk_apsr_upload FOREIGN KEY (upload_id) REFERENCES agency_psychotherapy_report_uploads(id) ON DELETE CASCADE,
  CONSTRAINT fk_apsr_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_apsr_provider_user FOREIGN KEY (provider_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_apsr_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

