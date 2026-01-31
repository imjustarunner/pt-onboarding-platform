-- Migration: Set specific user roles by email (data-only)
-- Purpose:
--   Ensure certain known accounts keep the intended role after DB resets / re-running migrations.
--
-- Notes:
--   - This project uses `users.role` (ENUM) for access roles.
--   - "guardian" maps to the enum value `client_guardian`.
--   - Idempotent: re-running is safe (will set the same values again).

UPDATE users
SET role = CASE LOWER(email)
  WHEN 'rachel@itsco.health' THEN 'admin'
  WHEN 'haley@plottwistco.com' THEN 'super_admin'
  WHEN 'hannah@plottwistco.com' THEN 'admin'
  WHEN 'kaitlyn@plottwistco.com' THEN 'super_admin'
  WHEN 'loriana@itsco.health' THEN 'admin'
  WHEN 'guardian@user.com' THEN 'client_guardian'
  WHEN 'test3@test.com' THEN 'school_staff'
  ELSE role
END
WHERE LOWER(email) IN (
  'rachel@itsco.health',
  'haley@plottwistco.com',
  'hannah@plottwistco.com',
  'kaitlyn@plottwistco.com',
  'loriana@itsco.health',
  'guardian@user.com',
  'test3@test.com'
);

