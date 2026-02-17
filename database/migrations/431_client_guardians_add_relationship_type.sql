-- Migration: Add relationship_type to client_guardians
-- Description:
-- - Distinguishes self-access adults from guardian/dependent access.
-- - Phase 1 values: self, guardian, proxy.

SET @has_rel_type := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'client_guardians'
    AND COLUMN_NAME = 'relationship_type'
);

SET @sql := IF(
  @has_rel_type = 0,
  "ALTER TABLE client_guardians ADD COLUMN relationship_type ENUM('self', 'guardian', 'proxy') NOT NULL DEFAULT 'guardian' AFTER guardian_user_id",
  "SELECT 1"
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_rel_type_idx := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'client_guardians'
    AND INDEX_NAME = 'idx_client_guardians_relationship_type'
);
SET @sql_idx := IF(
  @has_rel_type_idx = 0,
  "CREATE INDEX idx_client_guardians_relationship_type ON client_guardians(relationship_type)",
  "SELECT 1"
);
PREPARE stmt_idx FROM @sql_idx;
EXECUTE stmt_idx;
DEALLOCATE PREPARE stmt_idx;
