-- Migration: Receivables managed queue + run sequencing + email/audit trail

-- Add run_number to receivables uploads so agencies can track run1/run2/run3...
ALTER TABLE agency_receivables_report_uploads
  ADD COLUMN run_number INT NULL AFTER agency_id;

SET @prev_agency := NULL;
SET @seq := 0;
UPDATE agency_receivables_report_uploads u
JOIN (
  SELECT
    id,
    agency_id,
    (@seq := IF(@prev_agency = agency_id, @seq + 1, 1)) AS seq,
    (@prev_agency := agency_id) AS _agency_marker
  FROM agency_receivables_report_uploads
  ORDER BY agency_id ASC, created_at ASC, id ASC
) ordered ON ordered.id = u.id
SET u.run_number = ordered.seq
WHERE u.run_number IS NULL OR u.run_number <= 0;

ALTER TABLE agency_receivables_report_uploads
  MODIFY COLUMN run_number INT NOT NULL,
  ADD UNIQUE KEY uniq_arru_agency_run (agency_id, run_number),
  ADD KEY idx_arru_agency_run (agency_id, run_number);

-- Managed queue state directly on receivables rows
ALTER TABLE agency_receivables_report_rows
  ADD COLUMN collections_status ENUM('open','managed','closed') NOT NULL DEFAULT 'open' AFTER patient_outstanding_amount,
  ADD COLUMN managed_at TIMESTAMP NULL AFTER collections_status,
  ADD COLUMN managed_by_user_id INT NULL AFTER managed_at,
  ADD COLUMN managed_note TEXT NULL AFTER managed_by_user_id,
  ADD COLUMN last_email_draft_at TIMESTAMP NULL AFTER managed_note,
  ADD COLUMN last_email_draft_by_user_id INT NULL AFTER last_email_draft_at,
  ADD KEY idx_arr_rows_collections_status (agency_id, collections_status),
  ADD KEY idx_arr_rows_managed_at (managed_at),
  ADD CONSTRAINT fk_arr_rows_managed_by FOREIGN KEY (managed_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_arr_rows_last_email_draft_by FOREIGN KEY (last_email_draft_by_user_id) REFERENCES users(id) ON DELETE SET NULL;

-- Row-level actions for legal/audit defense
CREATE TABLE IF NOT EXISTS agency_receivables_row_audit (
  id BIGINT NOT NULL AUTO_INCREMENT,
  report_row_id BIGINT NOT NULL,
  agency_id INT NOT NULL,
  action_type ENUM('status_changed','managed_note_updated','email_draft_created','email_draft_updated') NOT NULL,
  from_status VARCHAR(32) NULL,
  to_status VARCHAR(32) NULL,
  note TEXT NULL,
  metadata_json JSON NULL,
  created_by_user_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_arr_audit_row_created (report_row_id, created_at),
  KEY idx_arr_audit_agency_created (agency_id, created_at),
  CONSTRAINT fk_arr_audit_row FOREIGN KEY (report_row_id) REFERENCES agency_receivables_report_rows(id) ON DELETE CASCADE,
  CONSTRAINT fk_arr_audit_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_arr_audit_user FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Generated outreach drafts (manual send outside platform for now)
CREATE TABLE IF NOT EXISTS agency_receivables_email_drafts (
  id BIGINT NOT NULL AUTO_INCREMENT,
  report_row_id BIGINT NOT NULL,
  agency_id INT NOT NULL,
  recipient_email VARCHAR(255) NULL,
  ehr_portal_link VARCHAR(1024) NULL,
  subject VARCHAR(255) NOT NULL,
  body MEDIUMTEXT NOT NULL,
  status ENUM('draft','sent','cancelled') NOT NULL DEFAULT 'draft',
  created_by_user_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  sent_at TIMESTAMP NULL,
  PRIMARY KEY (id),
  KEY idx_ared_row_created (report_row_id, created_at),
  KEY idx_ared_agency_created (agency_id, created_at),
  CONSTRAINT fk_ared_row FOREIGN KEY (report_row_id) REFERENCES agency_receivables_report_rows(id) ON DELETE CASCADE,
  CONSTRAINT fk_ared_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_ared_user FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
