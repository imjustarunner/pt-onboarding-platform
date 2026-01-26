-- Normalize user roles:
-- - Add 'super_admin' role (required for platform ownership)
-- - Ensure 'provider' role exists
-- - Migrate any legacy 'clinician' roles to 'provider'
-- - Drop 'clinician' from the enum so it cannot be set again
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
SET @def_norm := IF(@col_default = 'clinician', 'provider', @col_default);
SET @def_sql := IF(@def_norm IS NULL, '', CONCAT(' DEFAULT ', QUOTE(@def_norm)));

-- Step 1: ensure provider + super_admin exist in the enum (so we can update rows safely)
SET @enum_with_provider := @coltype;
SET @enum_with_provider := IF(@is_enum = 1 AND INSTR(@enum_with_provider, "'provider'") = 0, REPLACE(@enum_with_provider, ')', ",'provider')"), @enum_with_provider);
SET @enum_with_provider := IF(@is_enum = 1 AND INSTR(@enum_with_provider, "'super_admin'") = 0, REPLACE(@enum_with_provider, ')', ",'super_admin')"), @enum_with_provider);

SET @sql := IF(
  @is_enum = 1,
  CONCAT('ALTER TABLE users MODIFY COLUMN role ', @enum_with_provider, ' ', @null_sql, @def_sql),
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Step 2: migrate clinician -> provider
UPDATE users SET role = 'provider' WHERE role = 'clinician';

-- Step 3: drop clinician from the enum (post-migration)
SET @enum_final := @enum_with_provider;
SET @enum_final := REPLACE(@enum_final, "'clinician',", '');
SET @enum_final := REPLACE(@enum_final, ",'clinician'", '');
SET @enum_final := REPLACE(@enum_final, "('clinician')", "('provider')");
SET @enum_final := REPLACE(@enum_final, ',,', ',');
SET @enum_final := REPLACE(@enum_final, '(,', '(');
SET @enum_final := REPLACE(@enum_final, ',)', ')');

SET @sql := IF(
  @is_enum = 1,
  CONCAT('ALTER TABLE users MODIFY COLUMN role ', @enum_final, ' ', @null_sql, @def_sql),
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

