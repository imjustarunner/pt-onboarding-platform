-- Migration 1369: Wire Grant Beacon group email + ensure school ticket-intake routes
-- grantbeacon@itsco.health already has schoolreply as a member, but the school org
-- had no school_profiles.itsco_email so inbound mail could not create tickets.
-- Broader schoolreply membership gaps are healed by
-- reconcileSchoolGroupTicketIntakeForAgency (daily with school group contacts sync).

INSERT INTO school_profiles (school_organization_id, district_name, itsco_email)
SELECT a.id, 'Denver Public Schools', 'grantbeacon@itsco.health'
FROM agencies a
WHERE a.id = 425
  AND LOWER(COALESCE(a.slug, '')) = 'grant-beacon-middle-school'
  AND NOT EXISTS (
    SELECT 1 FROM school_profiles sp WHERE sp.school_organization_id = a.id
  );

UPDATE school_profiles
SET itsco_email = 'grantbeacon@itsco.health',
    district_name = COALESCE(NULLIF(TRIM(district_name), ''), 'Denver Public Schools'),
    updated_at = CURRENT_TIMESTAMP
WHERE school_organization_id = 425
  AND (
    itsco_email IS NULL
    OR TRIM(itsco_email) = ''
    OR LOWER(TRIM(itsco_email)) <> 'grantbeacon@itsco.health'
  );

INSERT INTO email_inbound_routes (sender_identity_id, email_address, is_active)
SELECT e.id, 'grantbeacon@itsco.health', 1
FROM email_sender_identities e
WHERE e.agency_id = 2
  AND LOWER(e.identity_key) COLLATE utf8mb4_unicode_ci IN ('schoolreply', 'school_reply')
  AND e.is_active = 1
  AND NOT EXISTS (
    SELECT 1
    FROM email_inbound_routes r
    WHERE LOWER(r.email_address) COLLATE utf8mb4_unicode_ci = 'grantbeacon@itsco.health'
  )
ORDER BY e.id ASC
LIMIT 1;

UPDATE email_inbound_routes r
JOIN email_sender_identities e ON e.id = r.sender_identity_id
SET r.is_active = 1,
    r.updated_at = CURRENT_TIMESTAMP
WHERE LOWER(r.email_address) COLLATE utf8mb4_unicode_ci = 'grantbeacon@itsco.health'
  AND e.agency_id = 2
  AND LOWER(e.identity_key) COLLATE utf8mb4_unicode_ci IN ('schoolreply', 'school_reply');
