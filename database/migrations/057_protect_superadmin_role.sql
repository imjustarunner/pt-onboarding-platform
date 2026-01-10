-- Migration: Create trigger to protect superadmin role at database level
-- Description: This ensures the role cannot be changed even if bypassing application code
-- Rewritten to be compatible with mysql2 prepared statements
-- Note: This file is executed as a raw query (not prepared statement) due to CREATE TRIGGER

DROP TRIGGER IF EXISTS protect_superadmin_role;

CREATE TRIGGER protect_superadmin_role
BEFORE UPDATE ON users
FOR EACH ROW
BEGIN
  IF OLD.email = 'superadmin@plottwistco.com' AND NEW.role != 'super_admin' THEN
    SET NEW.role = 'super_admin';
  END IF;
END;
