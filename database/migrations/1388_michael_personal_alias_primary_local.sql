-- Migration 1388: Align user 501 personal tenant aliases to primary local-part (michael@domain)
-- Signature / mailbox rule: michael@plottwistco.com → michael@{tenant mail domain}

UPDATE email_sender_identities
SET
  from_email = CONCAT('michael@', SUBSTRING_INDEX(LOWER(from_email), '@', -1)),
  reply_to = CONCAT('michael@', SUBSTRING_INDEX(LOWER(COALESCE(NULLIF(reply_to, ''), from_email)), '@', -1)),
  inbound_addresses_json = JSON_ARRAY(CONCAT('michael@', SUBSTRING_INDEX(LOWER(from_email), '@', -1))),
  updated_at = CURRENT_TIMESTAMP
WHERE identity_key = 'personal_501'
  AND from_email LIKE '%@%'
  AND LOWER(SUBSTRING_INDEX(from_email, '@', 1)) <> 'michael';

UPDATE communication_inboxes
SET
  from_email = CONCAT('michael@', SUBSTRING_INDEX(LOWER(from_email), '@', -1)),
  updated_at = CURRENT_TIMESTAMP
WHERE identity_key = 'personal_501'
  AND from_email LIKE '%@%'
  AND LOWER(SUBSTRING_INDEX(from_email, '@', 1)) <> 'michael';

-- Refresh inbound routes for renamed personal identities
UPDATE email_inbound_routes r
INNER JOIN email_sender_identities esi ON esi.id = r.sender_identity_id
SET
  r.email_address = esi.from_email,
  r.is_active = 1,
  r.updated_at = CURRENT_TIMESTAMP
WHERE esi.identity_key = 'personal_501';
