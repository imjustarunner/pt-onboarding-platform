-- Migration: Protect superadmin role (NO-OP)
-- Description: This migration was originally intended to create a database trigger to protect
-- the superadmin account from role changes. However, database triggers require SUPER privilege
-- which is not available in Cloud SQL (error 1419: ER_BINLOG_CREATE_ROUTINE_NEED_SUPER).
-- 
-- Instead, we use application-layer protection in:
--   - backend/src/models/User.model.js (User.update method)
--   - backend/src/controllers/user.controller.js (updateUser controller)
--
-- These application-layer checks prevent:
--   1. Changing superadmin@plottwistco.com away from super_admin role
--   2. Removing super_admin role from any user who currently has it
--
-- This migration is a no-op to maintain migration sequence integrity.
-- The protection is enforced at the application layer, not the database layer.

-- No SQL statements - this migration intentionally does nothing
SELECT 1;
