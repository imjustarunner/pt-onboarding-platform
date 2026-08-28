-- Migration 1333: School onboarding staff portal-access email (set-password link)
-- From: Notifications@ preferred; Reply-To overridden to Technology@ in send code.
-- Subject: {Agency} Portal Access for {School}

SET @platform_branding_id = (SELECT id FROM platform_branding ORDER BY id DESC LIMIT 1);

DELETE FROM email_templates
WHERE agency_id IS NULL
  AND platform_branding_id = @platform_branding_id
  AND type = 'school_onboarding_staff_portal_access';

INSERT INTO email_templates
  (name, type, subject, body, agency_id, platform_branding_id, created_by_user_id)
VALUES
(
  'School Onboarding Staff Portal Access',
  'school_onboarding_staff_portal_access',
  '{{AGENCY_NAME}} Portal Access for {{SCHOOL_NAME}}',
  'Hello {{FIRST_NAME}},\n\nWelcome to the {{AGENCY_NAME}} school staff portal for {{SCHOOL_NAME}}.\n\n{{INVITED_BY_NAME}} invited you to join this school account.\n\nYour access role: {{ACCESS_ROLE}}\n{{JOB_TITLE_LINE}}Username: {{USERNAME}}\n\nSet your password using this secure link (expires {{TOKEN_EXPIRES_AT}} / in {{TOKEN_EXPIRES_HOURS}} hours):\n{{RESET_TOKEN_LINK}}\n\nAfter you set your password, you can sign in anytime here:\n{{PORTAL_LOGIN_LINK}}\n\nImportant: this message often lands in Junk or Spam. Please check Junk, move it to Inbox if you find it there, and mark the sender as safe so you do not miss future messages from us.\n\nIf you did not expect this email, you can ignore it.\n\n—\n{{SENDER_NAME}}\n{{AGENCY_NAME}}\n',
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
      '$.school_onboarding_staff_portal_access', @notifications_id
    )
WHERE agency_id = @itsco_id
  AND @notifications_id IS NOT NULL;
