-- Migration 1297: Presence Time mailbox + planned-out contact prefs for text
-- time@plottwistco.com receives status / planned-out emails from Presence Board staff.

-- Expand planned_outs contact preferences to include text and combinations
ALTER TABLE planned_outs
  MODIFY COLUMN contact_preference ENUM(
    'call_only',
    'email_only',
    'text_only',
    'call_text',
    'call_email',
    'text_email',
    'call_text_email',
    'none'
  ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'none'
  COMMENT 'How to reach the person during a planned out';

-- Platform-level Presence Time sender (agency_id NULL = platform default)
INSERT INTO email_sender_identities (
  agency_id,
  identity_key,
  display_name,
  from_email,
  reply_to,
  inbound_addresses_json,
  is_active
)
SELECT
  NULL,
  'presence_time',
  'Presence Time',
  'time@plottwistco.com',
  'time@plottwistco.com',
  JSON_ARRAY('time@plottwistco.com'),
  1
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM email_sender_identities
  WHERE agency_id IS NULL AND LOWER(identity_key) = 'presence_time'
);

UPDATE email_sender_identities
SET display_name = 'Presence Time',
    from_email = 'time@plottwistco.com',
    reply_to = 'time@plottwistco.com',
    inbound_addresses_json = JSON_ARRAY('time@plottwistco.com'),
    is_active = 1
WHERE agency_id IS NULL
  AND LOWER(identity_key) = 'presence_time';

-- Inbound route so Gmail poll matches To: time@plottwistco.com
INSERT INTO email_inbound_routes (sender_identity_id, email_address, is_active)
SELECT e.id, 'time@plottwistco.com', TRUE
FROM email_sender_identities e
WHERE e.agency_id IS NULL
  AND LOWER(e.identity_key) = 'presence_time'
  AND NOT EXISTS (
    SELECT 1 FROM email_inbound_routes r
    WHERE LOWER(r.email_address) = 'time@plottwistco.com'
      AND r.sender_identity_id = e.id
      AND r.is_active = TRUE
  );
