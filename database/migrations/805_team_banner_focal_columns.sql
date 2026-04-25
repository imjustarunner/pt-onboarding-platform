-- Migration: add team banner focal columns
-- Description: Persist draggable banner focal position for challenge_teams.

SET @has_banner_focal_x := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'challenge_teams'
    AND COLUMN_NAME = 'banner_focal_x'
);
SET @sql := IF(
  @has_banner_focal_x = 0,
  'ALTER TABLE challenge_teams ADD COLUMN banner_focal_x DECIMAL(5,2) NOT NULL DEFAULT 50.00',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_banner_focal_y := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'challenge_teams'
    AND COLUMN_NAME = 'banner_focal_y'
);
SET @sql := IF(
  @has_banner_focal_y = 0,
  'ALTER TABLE challenge_teams ADD COLUMN banner_focal_y DECIMAL(5,2) NOT NULL DEFAULT 50.00',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
