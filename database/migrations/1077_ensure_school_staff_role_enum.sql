-- Migration 1077: Ensure users.role includes school_staff and other portal roles
-- Defensive add-only (does not remap clinician → provider).

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
-- Never preserve deprecated clinician as column default (restore-collapse residue / restores).
SET @def_norm := IF(@col_default IS NULL OR @col_default = 'clinician', 'provider', @col_default);
SET @def_sql := CONCAT(' DEFAULT ', QUOTE(@def_norm));

SET @enum_work := @coltype;
SET @enum_work := IF(@is_enum = 1 AND INSTR(@enum_work, "'super_admin'") = 0, REPLACE(@enum_work, ')', ",'super_admin')"), @enum_work);
SET @enum_work := IF(@is_enum = 1 AND INSTR(@enum_work, "'support'") = 0, REPLACE(@enum_work, ')', ",'support')"), @enum_work);
SET @enum_work := IF(@is_enum = 1 AND INSTR(@enum_work, "'staff'") = 0, REPLACE(@enum_work, ')', ",'staff')"), @enum_work);
SET @enum_work := IF(@is_enum = 1 AND INSTR(@enum_work, "'provider'") = 0, REPLACE(@enum_work, ')', ",'provider')"), @enum_work);
SET @enum_work := IF(@is_enum = 1 AND INSTR(@enum_work, "'provider_plus'") = 0, REPLACE(@enum_work, ')', ",'provider_plus')"), @enum_work);
SET @enum_work := IF(@is_enum = 1 AND INSTR(@enum_work, "'school_staff'") = 0, REPLACE(@enum_work, ')', ",'school_staff')"), @enum_work);
SET @enum_work := IF(@is_enum = 1 AND INSTR(@enum_work, "'client_guardian'") = 0, REPLACE(@enum_work, ')', ",'client_guardian')"), @enum_work);
SET @enum_work := IF(@is_enum = 1 AND INSTR(@enum_work, "'clinical_practice_assistant'") = 0, REPLACE(@enum_work, ')', ",'clinical_practice_assistant')"), @enum_work);
SET @enum_work := IF(@is_enum = 1 AND INSTR(@enum_work, "'athlete'") = 0, REPLACE(@enum_work, ')', ",'athlete')"), @enum_work);

SET @sql := IF(
  @is_enum = 1 AND @enum_work <> @coltype,
  CONCAT('ALTER TABLE users MODIFY COLUMN role ', @enum_work, ' ', @null_sql, @def_sql),
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
