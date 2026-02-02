-- Migration: Enhance bulk import jobs for preview/approve/undo workflow

-- Expand job status values
ALTER TABLE bulk_import_jobs
  MODIFY COLUMN status ENUM('RUNNING','COMPLETED','FAILED','PREVIEW','APPLYING','ROLLED_BACK') NOT NULL DEFAULT 'RUNNING';

-- Expand row status values + add payload/undo storage
ALTER TABLE bulk_import_job_rows
  MODIFY COLUMN status ENUM('PENDING','SUCCESS','ERROR','SKIPPED') NOT NULL,
  ADD COLUMN action VARCHAR(32) NULL AFTER identifier COMMENT 'create/update/apply',
  ADD COLUMN payload_json JSON NULL AFTER action,
  ADD COLUMN undo_json JSON NULL AFTER payload_json,
  ADD COLUMN applied_at TIMESTAMP NULL AFTER undo_json;

