-- Add a dedicated club_manager role for Summit Stats / club-scoped leadership.
-- This keeps club managers out of generic admin/backoffice experiences.
-- Use a plain ALTER TABLE so the project migration runner can execute it directly.

ALTER TABLE users
  MODIFY COLUMN role ENUM(
    'admin',
    'assistant_admin',
    'supervisor',
    'facilitator',
    'intern',
    'super_admin',
    'support',
    'staff',
    'provider',
    'school_staff',
    'client_guardian',
    'clinical_practice_assistant',
    'provider_plus',
    'kiosk',
    'club_manager'
  )
  NULL
  DEFAULT 'provider';

-- Convert Summit Stats-only club leaders away from global admin/provider-style roles.
-- Safety rule: only convert users whose active non-affiliation memberships are limited
-- to Summit Stats platform agencies (`ssc`, `sstc`, `summit-stats`).
UPDATE users u
SET u.role = 'club_manager'
WHERE LOWER(COALESCE(u.role, '')) IN ('admin', 'provider', 'provider_plus', 'staff', 'clinical_practice_assistant')
  AND EXISTS (
    SELECT 1
    FROM user_agencies ua
    INNER JOIN agencies a ON a.id = ua.agency_id
    WHERE ua.user_id = u.id
      AND COALESCE(ua.is_active, 1) = 1
      AND LOWER(COALESCE(a.organization_type, '')) = 'affiliation'
      AND COALESCE(ua.club_role, 'member') IN ('manager', 'assistant_manager')
  )
  AND NOT EXISTS (
    SELECT 1
    FROM user_agencies ua
    INNER JOIN agencies a ON a.id = ua.agency_id
    WHERE ua.user_id = u.id
      AND COALESCE(ua.is_active, 1) = 1
      AND LOWER(COALESCE(a.organization_type, '')) <> 'affiliation'
      AND LOWER(COALESCE(a.slug, '')) NOT IN ('ssc', 'sstc', 'summit-stats')
  );
