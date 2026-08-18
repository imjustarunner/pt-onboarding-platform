-- Migration 1238: ITSCO Technology Team sender for password reset
-- Sends forgot-password and staff-issued reset links from Technology@itsco.health.
-- Signature image is editable later in Email Settings → Sender Identities.

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

INSERT INTO email_sender_identities (
  agency_id,
  identity_key,
  display_name,
  from_email,
  reply_to,
  signature_image_url,
  signature_image_path,
  signature_alt_text,
  is_active
)
SELECT
  @itsco_id,
  'technology',
  'ITSCO Technology Team',
  'Technology@itsco.health',
  'Technology@itsco.health',
  '/email-signatures/itsco-technology-team.png',
  '/email-signatures/itsco-technology-team.png',
  'ITSCO Technology Team',
  1
FROM DUAL
WHERE @itsco_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM email_sender_identities
    WHERE agency_id = @itsco_id
      AND LOWER(identity_key) = 'technology'
  );

UPDATE email_sender_identities
SET display_name = 'ITSCO Technology Team',
    from_email = 'Technology@itsco.health',
    reply_to = 'Technology@itsco.health',
    signature_image_url = COALESCE(NULLIF(signature_image_url, ''), '/email-signatures/itsco-technology-team.png'),
    signature_image_path = COALESCE(NULLIF(signature_image_path, ''), '/email-signatures/itsco-technology-team.png'),
    signature_alt_text = COALESCE(NULLIF(signature_alt_text, ''), 'ITSCO Technology Team'),
    is_active = 1
WHERE agency_id = @itsco_id
  AND LOWER(identity_key) IN ('technology', 'login_recovery');

INSERT INTO agency_email_settings (agency_id, notifications_enabled)
SELECT @itsco_id, 1
FROM DUAL
WHERE @itsco_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM agency_email_settings WHERE agency_id = @itsco_id
  );

SET @tech_id = (
  SELECT id FROM email_sender_identities
  WHERE agency_id = @itsco_id AND LOWER(identity_key) = 'technology'
  ORDER BY id ASC
  LIMIT 1
);

UPDATE agency_email_settings
SET notifications_enabled = 1,
    template_sender_identity_json = JSON_SET(
      COALESCE(template_sender_identity_json, JSON_OBJECT()),
      '$.password_reset', @tech_id,
      '$.admin_initiated_password_reset', @tech_id
    )
WHERE agency_id = @itsco_id
  AND @tech_id IS NOT NULL;
