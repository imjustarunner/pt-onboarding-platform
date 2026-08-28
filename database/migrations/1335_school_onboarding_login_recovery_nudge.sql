-- Migration 1335: Login recovery nudge for school staff who never signed in after onboarding bug fix
-- From: Notifications@ preferred; Reply-To overridden to Technology@ in send code.

SET @platform_branding_id = (SELECT id FROM platform_branding ORDER BY id DESC LIMIT 1);

DELETE FROM email_templates
WHERE agency_id IS NULL
  AND platform_branding_id = @platform_branding_id
  AND type = 'school_onboarding_login_recovery_nudge';

INSERT INTO email_templates
  (name, type, subject, body, agency_id, platform_branding_id, created_by_user_id)
VALUES
(
  'School Onboarding Login Recovery Nudge',
  'school_onboarding_login_recovery_nudge',
  '{{AGENCY_NAME}} Portal Access for {{SCHOOL_NAME}}',
  'Hello {{FIRST_NAME}},\n\nWe noticed you have not signed in to the {{AGENCY_NAME}} school staff portal for {{SCHOOL_NAME}} yet, and you may be having trouble getting started.\n\nWe recently fixed a bug in our onboarding process. You can use the secure link below to set your password and access the portal:\n{{RESET_TOKEN_LINK}}\n\nThis link expires {{TOKEN_EXPIRES_AT}} (in {{TOKEN_EXPIRES_HOURS}} hours).\n\nAfter you set your password, sign in anytime here:\n{{PORTAL_LOGIN_LINK}}\n\nThank you for partnering with us. If you need help at any point, reply to this email or reach out to our team — we are happy to assist.\n\nImportant: this message often lands in Junk or Spam. Please check Junk, move it to Inbox if you find it there, and mark the sender as safe.\n\n—\n{{SENDER_NAME}}\n{{AGENCY_NAME}}\n',
  NULL,
  @platform_branding_id,
  NULL
);

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

SET @notifications_id = (
  SELECT id FROM email_sender_identities
  WHERE agency_id = @itsco_id AND LOWER(identity_key) = 'notifications'
  ORDER BY id ASC
  LIMIT 1
);

UPDATE agency_email_settings
SET notifications_enabled = 1,
    template_sender_identity_json = JSON_SET(
      COALESCE(template_sender_identity_json, JSON_OBJECT()),
      '$.school_onboarding_login_recovery_nudge', @notifications_id
    )
WHERE agency_id = @itsco_id
  AND @notifications_id IS NOT NULL;
