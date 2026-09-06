-- Migration 1392: TISI staff mail domain is innerstrengthin.com (website stays theinnerstrengthinstitute.com)
-- Staff signatures and mailbox aliases were incorrectly seeded on the marketing/website domain.

UPDATE agencies
SET feature_flags = JSON_SET(
  COALESCE(feature_flags, JSON_OBJECT()),
  '$.workspaceEmailDomain', 'innerstrengthin.com'
)
WHERE LOWER(COALESCE(slug, '')) IN (
  'tisi', 'inner-strength', 'innerstrength', 'theinnerstrengthinstitute', 'the-inner-strength-institute'
)
OR LOWER(COALESCE(custom_domain, '')) LIKE '%theinnerstrengthinstitute.com%';

UPDATE email_sender_identities esi
INNER JOIN agencies a ON a.id = esi.agency_id
SET
  esi.from_email = CONCAT(SUBSTRING_INDEX(esi.from_email, '@', 1), '@innerstrengthin.com'),
  esi.reply_to = CASE
    WHEN esi.reply_to IS NULL OR TRIM(esi.reply_to) = '' THEN esi.reply_to
    WHEN LOWER(esi.reply_to) LIKE '%@theinnerstrengthinstitute.com'
      THEN CONCAT(SUBSTRING_INDEX(esi.reply_to, '@', 1), '@innerstrengthin.com')
    ELSE esi.reply_to
  END,
  esi.inbound_addresses_json = CASE
    WHEN esi.inbound_addresses_json IS NULL THEN NULL
    ELSE REPLACE(
      CAST(esi.inbound_addresses_json AS CHAR CHARACTER SET utf8mb4),
      '@theinnerstrengthinstitute.com',
      '@innerstrengthin.com'
    )
  END
WHERE (
  LOWER(COALESCE(a.slug, '')) IN (
    'tisi', 'inner-strength', 'innerstrength', 'theinnerstrengthinstitute', 'the-inner-strength-institute'
  )
  OR LOWER(COALESCE(a.custom_domain, '')) LIKE '%theinnerstrengthinstitute.com%'
)
AND (
  LOWER(COALESCE(esi.from_email, '')) LIKE '%@theinnerstrengthinstitute.com'
  OR LOWER(COALESCE(esi.reply_to, '')) LIKE '%@theinnerstrengthinstitute.com'
  OR CAST(esi.inbound_addresses_json AS CHAR CHARACTER SET utf8mb4) LIKE '%@theinnerstrengthinstitute.com%'
);

UPDATE communication_inboxes ci
INNER JOIN agencies a ON a.id = ci.agency_id
SET ci.from_email = CONCAT(SUBSTRING_INDEX(ci.from_email, '@', 1), '@innerstrengthin.com')
WHERE (
  LOWER(COALESCE(a.slug, '')) IN (
    'tisi', 'inner-strength', 'innerstrength', 'theinnerstrengthinstitute', 'the-inner-strength-institute'
  )
  OR LOWER(COALESCE(a.custom_domain, '')) LIKE '%theinnerstrengthinstitute.com%'
)
AND LOWER(COALESCE(ci.from_email, '')) LIKE '%@theinnerstrengthinstitute.com';

UPDATE email_inbound_routes r
INNER JOIN email_sender_identities esi ON esi.id = r.sender_identity_id
INNER JOIN agencies a ON a.id = esi.agency_id
SET r.email_address = CONCAT(SUBSTRING_INDEX(r.email_address, '@', 1), '@innerstrengthin.com')
WHERE (
  LOWER(COALESCE(a.slug, '')) IN (
    'tisi', 'inner-strength', 'innerstrength', 'theinnerstrengthinstitute', 'the-inner-strength-institute'
  )
  OR LOWER(COALESCE(a.custom_domain, '')) LIKE '%theinnerstrengthinstitute.com%'
)
AND LOWER(COALESCE(r.email_address, '')) LIKE '%@theinnerstrengthinstitute.com';
