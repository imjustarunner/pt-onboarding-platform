-- Migration: Fix users.role enum for portal roles (defensive)
-- Purpose:
-- - Ensure required roles exist: super_admin, admin, staff, provider, school_staff, client_guardian
-- - Keep other existing enum values (e.g., supervisor/facilitator/intern) intact
-- - Migrate legacy clinician -> provider
-- - Drop clinician from enum so it cannot be set again
-- - Normalize default away from clinician
--
-- This migration is defensive: it introspects the current users.role column definition.

SET @db := DATABASE();
SET @coltype := (
  SELECT COLUMN_TYPE
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users' AND COLUMN_NAME = 'role'
  LIMIT 1
);
SET @is_nullable := (
  SELECT IS_NULLABLE
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users' AND COLUMN_NAME = 'role'
  LIMIT 1
);
SET @col_default := (
  SELECT COLUMN_DEFAULT
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users' AND COLUMN_NAME = 'role'
  LIMIT 1
);

SET @is_enum := IF(@coltype LIKE 'enum(%', 1, 0);
SET @null_sql := IF(@is_nullable = 'YES', 'NULL', 'NOT NULL');
SET @def_norm := IF(@col_default = 'clinician' OR @col_default = 'employee', 'provider', @col_default);
SET @def_sql := IF(@def_norm IS NULL, '', CONCAT(' DEFAULT ', QUOTE(@def_norm)));

-- Step 1: ensure required roles exist (add-only)
SET @enum_work := @coltype;
SET @enum_work := IF(@is_enum = 1 AND INSTR(@enum_work, "'super_admin'") = 0, REPLACE(@enum_work, ')', ",'super_admin')"), @enum_work);
SET @enum_work := IF(@is_enum = 1 AND INSTR(@enum_work, "'support'") = 0, REPLACE(@enum_work, ')', ",'support')"), @enum_work);
SET @enum_work := IF(@is_enum = 1 AND INSTR(@enum_work, "'staff'") = 0, REPLACE(@enum_work, ')', ",'staff')"), @enum_work);
SET @enum_work := IF(@is_enum = 1 AND INSTR(@enum_work, "'provider'") = 0, REPLACE(@enum_work, ')', ",'provider')"), @enum_work);
SET @enum_work := IF(@is_enum = 1 AND INSTR(@enum_work, "'school_staff'") = 0, REPLACE(@enum_work, ')', ",'school_staff')"), @enum_work);
SET @enum_work := IF(@is_enum = 1 AND INSTR(@enum_work, "'client_guardian'") = 0, REPLACE(@enum_work, ')', ",'client_guardian')"), @enum_work);
SET @enum_work := IF(@is_enum = 1 AND INSTR(@enum_work, "'clinical_practice_assistant'") = 0, REPLACE(@enum_work, ')', ",'clinical_practice_assistant')"), @enum_work);

SET @sql := IF(
  @is_enum = 1,
  CONCAT('ALTER TABLE users MODIFY COLUMN role ', @enum_work, ' ', @null_sql, @def_sql),
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Step 2: normalize legacy values (school_staff is never touched – clinician/employee/NULL only)
UPDATE users SET role = 'provider' WHERE role IS NULL;
UPDATE users SET role = 'provider' WHERE role = 'clinician';
UPDATE users SET role = 'provider' WHERE role = 'employee';

-- Step 3: drop clinician from enum so it cannot be set again
SET @enum_final := @enum_work;
SET @enum_final := REPLACE(@enum_final, "'clinician',", '');
SET @enum_final := REPLACE(@enum_final, ",'clinician'", '');
SET @enum_final := REPLACE(@enum_final, "('clinician')", "('provider')");
SET @enum_final := REPLACE(@enum_final, ',,', ',');
SET @enum_final := REPLACE(@enum_final, '(,', '(');
SET @enum_final := REPLACE(@enum_final, ',)', ')');

SET @def_final := IF(@def_norm = 'clinician', 'provider', @def_norm);
SET @def_final_sql := IF(@def_final IS NULL, CONCAT(" DEFAULT 'provider'"), CONCAT(' DEFAULT ', QUOTE(@def_final)));

SET @sql := IF(
  @is_enum = 1,
  CONCAT('ALTER TABLE users MODIFY COLUMN role ', @enum_final, ' ', @null_sql, @def_final_sql),
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

