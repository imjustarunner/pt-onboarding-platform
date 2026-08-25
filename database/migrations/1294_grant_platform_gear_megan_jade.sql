-- Migration 1294: Grant platform Gear & Materials access to materials leads
-- Megan Geil-Crader and Jade Littrell manage inventory across tenants without
-- needing a superadmin profile visit. Superadmins/admins already have access by role.

UPDATE users
SET has_platform_gear_access = 1
WHERE id IN (496, 486)
  AND (is_archived = 0 OR is_archived IS NULL OR is_archived = FALSE);
