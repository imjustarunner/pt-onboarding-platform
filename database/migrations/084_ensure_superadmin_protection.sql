-- Migration: Ensure superadmin protection (NO-OP)
-- Description: This migration was originally intended to recreate a database trigger to protect
-- the superadmin account. However, database triggers require SUPER privilege which is not
-- available in Cloud SQL (error 1419: ER_BINLOG_CREATE_ROUTINE_NEED_SUPER).
-- 
-- Instead, we use application-layer protection in:
--   - backend/src/models/User.model.js (User.update method)
--   - backend/src/controllers/user.controller.js (updateUser controller)
--
-- This migration ensures the superadmin account has the correct role, but does not create
-- a database trigger. The UPDATE statement is safe to run multiple times.

-- Ensure superadmin account has the correct role
UPDATE users 
SET role = 'super_admin' 
WHERE email = 'superadmin@plottwistco.com' AND role != 'super_admin';
