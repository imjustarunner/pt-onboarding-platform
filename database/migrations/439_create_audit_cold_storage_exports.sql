-- Migration: Track cold-storage export batches for audit logs
-- Description: Stores metadata for periodic export/prune jobs across hot audit tables.

CREATE TABLE IF NOT EXISTS audit_log_cold_storage_exports (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  table_name VARCHAR(128) NOT NULL,
  object_key VARCHAR(1024) NOT NULL,
  rows_exported INT NOT NULL DEFAULT 0,
  first_row_id BIGINT NULL,
  last_row_id BIGINT NULL,
  oldest_created_at DATETIME NULL,
  newest_created_at DATETIME NULL,
  exported_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  delete_applied TINYINT(1) NOT NULL DEFAULT 0,
  delete_applied_at DATETIME NULL,
  notes VARCHAR(512) NULL,
  INDEX idx_audit_cold_table_exported (table_name, exported_at),
  INDEX idx_audit_cold_delete_applied (delete_applied, exported_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
