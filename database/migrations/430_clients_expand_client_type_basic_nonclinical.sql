-- Migration: Expand clients.client_type with basic non-clinical baseline
-- Description:
-- - Adds basic_nonclinical as a first-class client type for non-clinical use cases.
-- - Sets default client type to basic_nonclinical.

SET @has_client_type := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'clients'
    AND COLUMN_NAME = 'client_type'
);

SET @sql := IF(
  @has_client_type > 0,
  "ALTER TABLE clients MODIFY COLUMN client_type ENUM('basic_nonclinical','school','learning','clinical') NOT NULL DEFAULT 'basic_nonclinical'",
  "SELECT 1"
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
