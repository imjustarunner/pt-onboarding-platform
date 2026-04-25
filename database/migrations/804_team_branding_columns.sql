-- Migration: add team branding columns
-- Description: Persist team logo/banner uploads on challenge_teams.

SET @has_logo_path := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'challenge_teams'
    AND COLUMN_NAME = 'logo_path'
);
SET @sql := IF(
  @has_logo_path = 0,
  'ALTER TABLE challenge_teams ADD COLUMN logo_path VARCHAR(500) NULL DEFAULT NULL COMMENT ''Relative path to team logo in uploads''',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_banner_path := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'challenge_teams'
    AND COLUMN_NAME = 'banner_path'
);
SET @sql := IF(
  @has_banner_path = 0,
  'ALTER TABLE challenge_teams ADD COLUMN banner_path VARCHAR(500) NULL DEFAULT NULL COMMENT ''Relative path to team banner in uploads''',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
