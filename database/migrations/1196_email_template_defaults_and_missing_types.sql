-- Migration 1196: email template defaults + seed missing catalog types
-- Multiple templates per type; is_default marks the current one.

ALTER TABLE email_templates
  ADD COLUMN is_default TINYINT(1) NOT NULL DEFAULT 0
  COMMENT '1 = current/default template for this type and agency (or platform)';

SET @platform_branding_id = (SELECT id FROM platform_branding ORDER BY id DESC LIMIT 1);

INSERT INTO email_templates (name, type, subject, body, agency_id, platform_branding_id, created_by_user_id, is_default)
SELECT 'Forgot Password', 'password_reset',
  'Reset your {{AGENCY_NAME}} password',
  'Hello {{FIRST_NAME}},\n\nWe received a request to reset the password for your {{AGENCY_NAME}} account.\n\nSet a new password using this link (expires in 48 hours):\n{{RESET_TOKEN_LINK}}\n\nUsername: {{USERNAME}}\nPortal: {{PORTAL_LOGIN_LINK}}\n\nImportant: this message often lands in Junk or Spam. Please check Junk, move it to Inbox if you find it there, and mark the sender as safe so you do not miss future messages from us.\n\nIf you did not request this, you can ignore this email.\n\n—\n{{SENDER_NAME}}\n{{AGENCY_NAME}}\n',
  NULL, @platform_branding_id, NULL, 1
FROM DUAL
WHERE @platform_branding_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM email_templates t
    WHERE t.type = 'password_reset' AND t.agency_id IS NULL AND t.platform_branding_id = @platform_branding_id
  );

INSERT INTO email_templates (name, type, subject, body, agency_id, platform_branding_id, created_by_user_id, is_default)
SELECT 'School ROI Signing Link', 'school_roi_signing',
  'Please sign the {{AGENCY_NAME}} release of information',
  'Hello {{FIRST_NAME}},\n\nPlease review and sign the release of information for {{AGENCY_NAME}}.\n\nSigning link:\n{{PORTAL_LOGIN_LINK}}\n\nIf you have questions, reply to this email.\n\n—\n{{SENDER_NAME}}\n{{AGENCY_NAME}}\n',
  NULL, @platform_branding_id, NULL, 1
FROM DUAL
WHERE @platform_branding_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM email_templates t
    WHERE t.type = 'school_roi_signing' AND t.agency_id IS NULL AND t.platform_branding_id = @platform_branding_id
  );

INSERT INTO email_templates (name, type, subject, body, agency_id, platform_branding_id, created_by_user_id, is_default)
SELECT 'School ROI Completion', 'school_roi_signer_completion',
  'Your {{AGENCY_NAME}} ROI is complete',
  'Hello {{FIRST_NAME}},\n\nThank you for completing the release of information for {{AGENCY_NAME}}.\n\nYou can return to the portal anytime:\n{{PORTAL_LOGIN_LINK}}\n\n—\n{{SENDER_NAME}}\n{{AGENCY_NAME}}\n',
  NULL, @platform_branding_id, NULL, 1
FROM DUAL
WHERE @platform_branding_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM email_templates t
    WHERE t.type = 'school_roi_signer_completion' AND t.agency_id IS NULL AND t.platform_branding_id = @platform_branding_id
  );

INSERT INTO email_templates (name, type, subject, body, agency_id, platform_branding_id, created_by_user_id, is_default)
SELECT 'School ROI Release', 'school_roi_release',
  '{{AGENCY_NAME}} records release',
  'Hello {{FIRST_NAME}},\n\nThis message concerns a records release for {{AGENCY_NAME}}.\n\nPortal:\n{{PORTAL_LOGIN_LINK}}\n\n—\n{{SENDER_NAME}}\n{{AGENCY_NAME}}\n',
  NULL, @platform_branding_id, NULL, 1
FROM DUAL
WHERE @platform_branding_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM email_templates t
    WHERE t.type = 'school_roi_release' AND t.agency_id IS NULL AND t.platform_branding_id = @platform_branding_id
  );

INSERT INTO email_templates (name, type, subject, body, agency_id, platform_branding_id, created_by_user_id, is_default)
SELECT 'Smart School ROI', 'smart_school_roi',
  'School ROI for {{AGENCY_NAME}}',
  'Hello {{FIRST_NAME}},\n\nPlease complete the school release of information for {{AGENCY_NAME}}.\n\n{{PORTAL_LOGIN_LINK}}\n\n—\n{{SENDER_NAME}}\n{{AGENCY_NAME}}\n',
  NULL, @platform_branding_id, NULL, 1
FROM DUAL
WHERE @platform_branding_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM email_templates t
    WHERE t.type = 'smart_school_roi' AND t.agency_id IS NULL AND t.platform_branding_id = @platform_branding_id
  );

INSERT INTO email_templates (name, type, subject, body, agency_id, platform_branding_id, created_by_user_id, is_default)
SELECT 'Intake & Registration', 'intake',
  'Your {{AGENCY_NAME}} intake',
  'Hello {{FIRST_NAME}},\n\nThank you for completing intake with {{AGENCY_NAME}}.\n\nPortal:\n{{PORTAL_LOGIN_LINK}}\n\n—\n{{SENDER_NAME}}\n{{AGENCY_NAME}}\n',
  NULL, @platform_branding_id, NULL, 1
FROM DUAL
WHERE @platform_branding_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM email_templates t
    WHERE t.type = 'intake' AND t.agency_id IS NULL AND t.platform_branding_id = @platform_branding_id
  );

INSERT INTO email_templates (name, type, subject, body, agency_id, platform_branding_id, created_by_user_id, is_default)
SELECT 'Job Application Received', 'job_applications',
  'We received your {{AGENCY_NAME}} application',
  'Hello {{FIRST_NAME}},\n\nThank you for applying to {{AGENCY_NAME}}. We received your application and will follow up as the process moves forward.\n\n—\n{{SENDER_NAME}}\n{{AGENCY_NAME}}\n',
  NULL, @platform_branding_id, NULL, 1
FROM DUAL
WHERE @platform_branding_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM email_templates t
    WHERE t.type = 'job_applications' AND t.agency_id IS NULL AND t.platform_branding_id = @platform_branding_id
  );

INSERT INTO email_templates (name, type, subject, body, agency_id, platform_branding_id, created_by_user_id, is_default)
SELECT 'Hiring References', 'hiring_references',
  'Reference request from {{AGENCY_NAME}}',
  'Hello {{FIRST_NAME}},\n\n{{AGENCY_NAME}} is requesting a professional reference.\n\nPlease use this link to complete the form:\n{{PORTAL_LOGIN_LINK}}\n\nThank you,\n{{SENDER_NAME}}\n{{AGENCY_NAME}}\n',
  NULL, @platform_branding_id, NULL, 1
FROM DUAL
WHERE @platform_branding_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM email_templates t
    WHERE t.type = 'hiring_references' AND t.agency_id IS NULL AND t.platform_branding_id = @platform_branding_id
  );

INSERT INTO email_templates (name, type, subject, body, agency_id, platform_branding_id, created_by_user_id, is_default)
SELECT 'Staff-composed email', 'manual',
  'Message from {{AGENCY_NAME}}',
  'Hello {{FIRST_NAME}},\n\n{{AGENCY_NAME}} sent you a message.\n\n—\n{{SENDER_NAME}}\n{{AGENCY_NAME}}\n',
  NULL, @platform_branding_id, NULL, 1
FROM DUAL
WHERE @platform_branding_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM email_templates t
    WHERE t.type = 'manual' AND t.agency_id IS NULL AND t.platform_branding_id = @platform_branding_id
  );

INSERT INTO email_templates (name, type, subject, body, agency_id, platform_branding_id, created_by_user_id, is_default)
SELECT 'Default outbound', 'default',
  'Message from {{AGENCY_NAME}}',
  'Hello {{FIRST_NAME}},\n\nThis is a message from {{AGENCY_NAME}}.\n\nPortal: {{PORTAL_LOGIN_LINK}}\n\n—\n{{SENDER_NAME}}\n{{AGENCY_NAME}}\n',
  NULL, @platform_branding_id, NULL, 1
FROM DUAL
WHERE @platform_branding_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM email_templates t
    WHERE t.type = 'default' AND t.agency_id IS NULL AND t.platform_branding_id = @platform_branding_id
  );

UPDATE email_templates t
INNER JOIN (
  SELECT type, IFNULL(agency_id, 0) AS aid, MAX(id) AS keep_id
  FROM email_templates
  GROUP BY type, IFNULL(agency_id, 0)
) x ON x.keep_id = t.id
LEFT JOIN email_templates already
  ON already.type = t.type
 AND ((already.agency_id IS NULL AND t.agency_id IS NULL) OR already.agency_id <=> t.agency_id)
 AND already.is_default = 1
SET t.is_default = 1
WHERE already.id IS NULL;
