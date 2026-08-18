-- Migration 1240: Route school staff portal-access and recovery emails to ITSCO Technology Team
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
      '$.school_staff_portal_access', @tech_id,
      '$.school_staff_account_recovery', @tech_id,
      '$.password_reset', @tech_id,
      '$.admin_initiated_password_reset', @tech_id
    )
WHERE agency_id = @itsco_id
  AND @tech_id IS NOT NULL;
