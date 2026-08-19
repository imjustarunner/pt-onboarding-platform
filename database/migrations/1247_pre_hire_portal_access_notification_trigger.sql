-- Migration 1247: Pre-hire portal access notification trigger (People Operations sender)

INSERT INTO notification_triggers
  (trigger_key, name, description, default_enabled, default_channels_json, default_recipients_json)
VALUES
  (
    'pre_hire_admin_review_access',
    'Pre-hire portal access',
    'Email sent to a candidate when they are marked hired and given access to the pre-hire portal.',
    1,
    JSON_OBJECT('inApp', FALSE, 'sms', FALSE, 'email', TRUE),
    JSON_OBJECT('provider', FALSE, 'supervisor', FALSE, 'clinicalPracticeAssistant', FALSE, 'admin', FALSE)
  )
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  description = VALUES(description),
  default_enabled = VALUES(default_enabled),
  default_channels_json = VALUES(default_channels_json),
  default_recipients_json = VALUES(default_recipients_json);

-- ITSCO: wire trigger to People Operations sender (PO@ITSCO.health, replies to PO)
SET @itsco_id = (
  SELECT id FROM agencies
  WHERE organization_type = 'agency'
    AND (
      LOWER(COALESCE(slug, '')) IN ('itsco')
      OR LOWER(COALESCE(portal_url, '')) IN ('itsco')
    )
  ORDER BY id ASC
  LIMIT 1
);

SET @po_identity_id = (
  SELECT id FROM email_sender_identities
  WHERE agency_id = @itsco_id AND LOWER(identity_key) = 'people_operations'
  ORDER BY id ASC
  LIMIT 1
);

UPDATE notification_triggers
SET default_sender_identity_id = @po_identity_id
WHERE trigger_key = 'pre_hire_admin_review_access'
  AND @po_identity_id IS NOT NULL;

INSERT INTO agency_notification_trigger_settings
  (agency_id, trigger_key, enabled, channels_json, sender_identity_id)
SELECT
  @itsco_id,
  'pre_hire_admin_review_access',
  1,
  JSON_OBJECT('inApp', FALSE, 'sms', FALSE, 'email', TRUE),
  @po_identity_id
FROM DUAL
WHERE @itsco_id IS NOT NULL
  AND @po_identity_id IS NOT NULL
ON DUPLICATE KEY UPDATE
  enabled = 1,
  channels_json = JSON_OBJECT('inApp', FALSE, 'sms', FALSE, 'email', TRUE),
  sender_identity_id = COALESCE(VALUES(sender_identity_id), sender_identity_id);
