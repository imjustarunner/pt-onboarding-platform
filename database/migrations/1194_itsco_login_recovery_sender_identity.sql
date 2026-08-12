-- Migration 1194: ITSCO login recovery / notifications sender identities
-- Forgot-password and system notices should send from notifications@itsco.health,
-- which already has Gmail send-as permission via existing ITSCO identities.

INSERT INTO email_sender_identities (
  agency_id,
  identity_key,
  display_name,
  from_email,
  reply_to,
  is_active
)
SELECT
  2,
  'login_recovery',
  'ITSCO - Login Recovery',
  'notifications@itsco.health',
  'po@itsco.health',
  1
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1
  FROM email_sender_identities
  WHERE agency_id = 2
    AND LOWER(identity_key) = 'login_recovery'
);

INSERT INTO email_sender_identities (
  agency_id,
  identity_key,
  display_name,
  from_email,
  reply_to,
  is_active
)
SELECT
  2,
  'notifications',
  'ITSCO - Notifications',
  'notifications@itsco.health',
  'po@itsco.health',
  1
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1
  FROM email_sender_identities
  WHERE agency_id = 2
    AND LOWER(identity_key) = 'notifications'
);
