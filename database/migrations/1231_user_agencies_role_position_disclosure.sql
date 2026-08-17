-- Migration 1231: Per-tenant role, position, and disclosure include flag
-- A person can be admin at ITSCO, tutor at Next Level Up, supervisor at NLU.
-- Disclosure uses this membership — not the global users.role — so automated
-- "admins never appear" rules stop hiding clinicians who also hold admin access.

ALTER TABLE user_agencies
  ADD COLUMN agency_role VARCHAR(64) NULL
    COMMENT 'Tenant-scoped clinical/admin role for this membership; NULL = use users.role',
  ADD COLUMN agency_position VARCHAR(120) NULL
    COMMENT 'Optional display title at this tenant (overrides users.title on disclosure)',
  ADD COLUMN include_on_disclosure TINYINT(1) NULL
    COMMENT 'NULL = auto from agency_role; 1 = force include; 0 = force exclude';

CREATE INDEX idx_user_agencies_disclosure
  ON user_agencies (agency_id, include_on_disclosure, agency_role);

-- Melissa Mendez: credentialing specialist at ITSCO (exclude), tutor at Next Level Up (include)
UPDATE user_agencies ua
JOIN users u ON u.id = ua.user_id
JOIN agencies a ON a.id = ua.agency_id
SET ua.include_on_disclosure = 0,
    ua.agency_role = 'admin',
    ua.agency_position = COALESCE(NULLIF(ua.agency_position, ''), 'Credentialing Specialist')
WHERE LOWER(TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, '')))) = 'melissa mendez'
  AND (
    LOWER(COALESCE(a.slug, '')) IN ('itsco')
    OR LOWER(COALESCE(a.portal_url, '')) IN ('itsco')
    OR LOWER(COALESCE(a.name, '')) LIKE '%itsco%'
  )
  AND LOWER(COALESCE(a.organization_type, 'agency')) NOT IN ('school', 'program', 'learning');

INSERT INTO user_agencies (user_id, agency_id, is_active, agency_role, agency_position, include_on_disclosure)
SELECT u.id, a.id, 1, 'tutor', 'Tutor', 1
FROM users u
JOIN (
  SELECT id
  FROM agencies
  WHERE LOWER(COALESCE(organization_type, 'agency')) NOT IN ('school', 'program', 'learning')
    AND (
      LOWER(COALESCE(slug, '')) IN ('nextlevelup', 'next-level-up', 'nextleveluplcc')
      OR LOWER(COALESCE(portal_url, '')) IN ('nextlevelup', 'next-level-up', 'nextleveluplcc')
      OR LOWER(COALESCE(name, '')) LIKE '%next level up%'
    )
  ORDER BY CASE LOWER(COALESCE(slug, '')) WHEN 'nextlevelup' THEN 0 ELSE 1 END, id ASC
  LIMIT 1
) a
WHERE LOWER(TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, '')))) = 'melissa mendez'
ON DUPLICATE KEY UPDATE
  is_active = 1,
  agency_role = 'tutor',
  agency_position = COALESCE(NULLIF(user_agencies.agency_position, ''), 'Tutor'),
  include_on_disclosure = 1;

-- Loriana / Hannah: ITSCO admin staff, never on disclosure
UPDATE user_agencies ua
JOIN users u ON u.id = ua.user_id
JOIN agencies a ON a.id = ua.agency_id
SET ua.include_on_disclosure = 0,
    ua.agency_role = COALESCE(NULLIF(ua.agency_role, ''), 'admin')
WHERE LOWER(TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, '')))) IN (
  'loriana pincente',
  'hannah inyart'
)
AND (
  LOWER(COALESCE(a.slug, '')) IN ('itsco')
  OR LOWER(COALESCE(a.portal_url, '')) IN ('itsco')
);
