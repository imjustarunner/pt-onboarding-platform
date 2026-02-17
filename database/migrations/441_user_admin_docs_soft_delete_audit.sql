-- Migration: Soft-delete + delete audit metadata for admin docs
-- Purpose:
--   1) Retain entries/files for compliance and anti-abuse auditability
--   2) Allow UI "delete" actions to hide docs from normal view without hard removal

ALTER TABLE user_admin_docs
  ADD COLUMN is_deleted TINYINT(1) NOT NULL DEFAULT 0 AFTER mime_type,
  ADD COLUMN deleted_at TIMESTAMP NULL AFTER is_deleted,
  ADD COLUMN deleted_by_user_id INT NULL AFTER deleted_at,
  ADD INDEX idx_user_admin_docs_is_deleted (is_deleted),
  ADD INDEX idx_user_admin_docs_deleted_at (deleted_at),
  ADD INDEX idx_user_admin_docs_deleted_by (deleted_by_user_id);

