-- Migration 1368: Wire Sabin Middle School group email into schoolreply ticket intake
-- Google Group sabin@itsco.health exists and delivers to schoolreply/ai@, but the
-- school had no school_profiles.itsco_email and no email_inbound_routes row, so the
-- inbound email agent could not map messages to Sabin or create support tickets.

INSERT INTO school_profiles (school_organization_id, district_name, itsco_email)
SELECT a.id, 'Colorado Springs School District 11', 'sabin@itsco.health'
FROM agencies a
WHERE a.id = 422
  AND LOWER(COALESCE(a.slug, '')) = 'sabin-middle-school'
  AND NOT EXISTS (
    SELECT 1 FROM school_profiles sp WHERE sp.school_organization_id = a.id
  );

UPDATE school_profiles
SET itsco_email = 'sabin@itsco.health',
    district_name = COALESCE(NULLIF(TRIM(district_name), ''), 'Colorado Springs School District 11'),
    updated_at = CURRENT_TIMESTAMP
WHERE school_organization_id = 422
  AND (
    itsco_email IS NULL
    OR TRIM(itsco_email) = ''
    OR LOWER(TRIM(itsco_email)) <> 'sabin@itsco.health'
  );

-- Attach sabin@ to the ITSCO schoolreply identity inbound routes (if identity exists).
INSERT INTO email_inbound_routes (sender_identity_id, email_address, is_active)
SELECT e.id, 'sabin@itsco.health', 1
FROM email_sender_identities e
WHERE e.agency_id = 2
  AND LOWER(e.identity_key) COLLATE utf8mb4_unicode_ci IN ('schoolreply', 'school_reply')
  AND e.is_active = 1
  AND NOT EXISTS (
    SELECT 1
    FROM email_inbound_routes r
    WHERE LOWER(r.email_address) COLLATE utf8mb4_unicode_ci = 'sabin@itsco.health'
  )
ORDER BY e.id ASC
LIMIT 1;

UPDATE email_inbound_routes r
JOIN email_sender_identities e ON e.id = r.sender_identity_id
SET r.is_active = 1,
    r.updated_at = CURRENT_TIMESTAMP
WHERE LOWER(r.email_address) COLLATE utf8mb4_unicode_ci = 'sabin@itsco.health'
  AND e.agency_id = 2
  AND LOWER(e.identity_key) COLLATE utf8mb4_unicode_ci IN ('schoolreply', 'school_reply');
