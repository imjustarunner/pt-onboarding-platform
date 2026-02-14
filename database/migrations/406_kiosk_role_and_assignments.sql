-- Migration: Add kiosk role and kiosk_agency_assignments table
-- Description: Kiosks as users with special role. Assignments link kiosks to agencies/locations/programs

-- Add kiosk role to users.role enum (defensive, add-only)
SET @db := DATABASE();
SET @coltype := (
  SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users' AND COLUMN_NAME = 'role' LIMIT 1
);
SET @is_enum := IF(@coltype LIKE 'enum(%', 1, 0);
SET @null_sql := (SELECT IF(IS_NULLABLE = 'YES', 'NULL', 'NOT NULL') FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users' AND COLUMN_NAME = 'role' LIMIT 1);
SET @def_sql := (SELECT IF(COLUMN_DEFAULT IS NULL, " DEFAULT 'provider'", CONCAT(' DEFAULT ', QUOTE(COLUMN_DEFAULT))) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users' AND COLUMN_NAME = 'role' LIMIT 1);
SET @enum_work := @coltype;
SET @enum_work := IF(@is_enum = 1 AND INSTR(@enum_work, "'kiosk'") = 0, REPLACE(@enum_work, ')', ",'kiosk')"), @enum_work);
SET @sql := IF(@is_enum = 1, CONCAT('ALTER TABLE users MODIFY COLUMN role ', @enum_work, ' ', @null_sql, @def_sql), 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Kiosk–agency assignments (agency, optional location, optional program, per-kiosk settings)
CREATE TABLE IF NOT EXISTS kiosk_agency_assignments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  kiosk_user_id INT NOT NULL,
  agency_id INT NOT NULL,
  office_location_id INT NULL COMMENT 'null = all locations for agency',
  program_id INT NULL COMMENT 'null = all programs, set = program-scoped kiosk',
  settings_json JSON NULL COMMENT 'allowed_modes, default_mode, show_mode_selector',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_kiosk_agency_loc_prog (kiosk_user_id, agency_id, office_location_id, program_id),
  INDEX idx_kiosk_assignments_user (kiosk_user_id),
  INDEX idx_kiosk_assignments_agency (agency_id),
  INDEX idx_kiosk_assignments_location (office_location_id),
  INDEX idx_kiosk_assignments_program (program_id),
  CONSTRAINT fk_kiosk_assignments_user FOREIGN KEY (kiosk_user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_kiosk_assignments_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_kiosk_assignments_location FOREIGN KEY (office_location_id) REFERENCES office_locations(id) ON DELETE SET NULL,
  CONSTRAINT fk_kiosk_assignments_program FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
