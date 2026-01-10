-- Migration: Ensure superadmin protection trigger exists
-- Description: Recreate the superadmin protection trigger to ensure it's always active
-- This migration can be run safely multiple times
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

UPDATE users 
SET role = 'super_admin' 
WHERE email = 'superadmin@plottwistco.com' AND role != 'super_admin';
