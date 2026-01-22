-- Add Title and Service Focus to users (account area fields).
-- Safe/idempotent: adds columns only if missing.

SET @db := DATABASE();

SET @has_title := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db
    AND TABLE_NAME = 'users'
    AND COLUMN_NAME = 'title'
);
SET @sql_title := IF(
  @has_title = 0,
  'ALTER TABLE users ADD COLUMN title VARCHAR(120) NULL',
  'SELECT 1'
);
PREPARE stmt_title FROM @sql_title;
EXECUTE stmt_title;
DEALLOCATE PREPARE stmt_title;

SET @has_service_focus := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db
    AND TABLE_NAME = 'users'
    AND COLUMN_NAME = 'service_focus'
);
SET @sql_service_focus := IF(
  @has_service_focus = 0,
  'ALTER TABLE users ADD COLUMN service_focus VARCHAR(255) NULL',
  'SELECT 1'
);
PREPARE stmt_service_focus FROM @sql_service_focus;
EXECUTE stmt_service_focus;
DEALLOCATE PREPARE stmt_service_focus;

