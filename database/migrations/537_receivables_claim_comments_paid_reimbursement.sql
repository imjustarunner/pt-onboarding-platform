-- Migration: Receivables claim comments + paid tracking + reimbursement percent

ALTER TABLE agency_receivables_report_rows
  ADD COLUMN paid_at TIMESTAMP NULL AFTER last_email_draft_by_user_id,
  ADD COLUMN paid_by_user_id INT NULL AFTER paid_at,
  ADD COLUMN paid_note TEXT NULL AFTER paid_by_user_id,
  ADD COLUMN reimbursed_percent DECIMAL(5,2) NOT NULL DEFAULT 0.00 AFTER paid_note,
  ADD COLUMN reimbursed_updated_at TIMESTAMP NULL AFTER reimbursed_percent,
  ADD COLUMN reimbursed_updated_by_user_id INT NULL AFTER reimbursed_updated_at,
  ADD KEY idx_arr_rows_paid_at (paid_at),
  ADD KEY idx_arr_rows_reimbursed_percent (reimbursed_percent),
  ADD CONSTRAINT fk_arr_rows_paid_by FOREIGN KEY (paid_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_arr_rows_reimbursed_updated_by FOREIGN KEY (reimbursed_updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS agency_receivables_row_comments (
  id BIGINT NOT NULL AUTO_INCREMENT,
  report_row_id BIGINT NOT NULL,
  agency_id INT NOT NULL,
  comment_text TEXT NOT NULL,
  created_by_user_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_arrc_row_created (report_row_id, created_at),
  KEY idx_arrc_agency_created (agency_id, created_at),
  CONSTRAINT fk_arrc_row FOREIGN KEY (report_row_id) REFERENCES agency_receivables_report_rows(id) ON DELETE CASCADE,
  CONSTRAINT fk_arrc_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_arrc_user FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
