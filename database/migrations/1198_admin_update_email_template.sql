-- Migration 1198: platform template for Admin Update newsletter type

SET @platform_branding_id = (SELECT id FROM platform_branding ORDER BY id DESC LIMIT 1);

INSERT INTO email_templates (name, type, subject, body, agency_id, platform_branding_id, created_by_user_id, is_default)
SELECT 'Admin Update newsletter', 'admin_update',
  '{{AGENCY_NAME}} Admin Updates',
  'Hello {{FIRST_NAME}},\n\nYour {{AGENCY_NAME}} Admin Update is ready. This type is composed as a branded HTML newsletter in Communications Center — this template is the fallback subject/body if needed.\n\n—\n{{SENDER_NAME}}\n{{AGENCY_NAME}}\n',
  NULL, @platform_branding_id, NULL, 1
FROM DUAL
WHERE @platform_branding_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM email_templates t
    WHERE t.type = 'admin_update' AND t.agency_id IS NULL AND t.platform_branding_id = @platform_branding_id
  );
