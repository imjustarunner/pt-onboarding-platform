-- Migration: Ensure bulk import job tables exist (Cloud Run / bulk-client-upload)
-- Why: Some environments were missing bulk_import_jobs / bulk_import_job_rows, causing 500s on
--      POST /api/bulk-client-upload with "Table '<db>.bulk_import_jobs' doesn't exist".
-- Safe: Uses IF NOT EXISTS and a conservative ALTER for uploaded_by_user_id nullability.

CREATE TABLE IF NOT EXISTS bulk_import_jobs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  uploaded_by_user_id INT NULL,
  file_name VARCHAR(500) NOT NULL,
  started_at TIMESTAMP NULL,
  finished_at TIMESTAMP NULL,
  total_rows INT NOT NULL DEFAULT 0,
  success_rows INT NOT NULL DEFAULT 0,
  failed_rows INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  FOREIGN KEY (uploaded_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_bulk_job_agency (agency_id),
  INDEX idx_bulk_job_created (created_at)
);

CREATE TABLE IF NOT EXISTS bulk_import_job_rows (
  id INT AUTO_INCREMENT PRIMARY KEY,
  job_id INT NOT NULL,
  `row_number` INT NOT NULL,
  `status` ENUM('success','failed') NOT NULL,
  message TEXT NULL,
  entity_ids JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (job_id) REFERENCES bulk_import_jobs(id) ON DELETE CASCADE,
  UNIQUE KEY uniq_job_row (job_id, `row_number`),
  INDEX idx_job_status (job_id, `status`)
);

-- If the table already existed but the column was NOT NULL, make it nullable so ON DELETE SET NULL is valid.
ALTER TABLE bulk_import_jobs
  MODIFY uploaded_by_user_id INT NULL;

