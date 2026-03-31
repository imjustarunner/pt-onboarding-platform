-- Migration 641: Seed default company event invitation template

SET @platform_branding_id = (SELECT id FROM platform_branding ORDER BY id DESC LIMIT 1);

DELETE FROM email_templates
WHERE agency_id IS NULL
  AND platform_branding_id = @platform_branding_id
  AND type = 'company_event_invitation';

INSERT INTO email_templates
  (name, type, subject, body, agency_id, platform_branding_id, created_by_user_id)
VALUES
(
  'Company Event Invitation (RSVP Token)',
  'company_event_invitation',
  'You are invited: {{EVENT_TITLE}}',
  'Hi {{FIRST_NAME}},\n\nWe''re hosting a {{EVENT_TYPE_LABEL}} and we''d love for you to join us.\n\nEvent details:\n- When: {{EVENT_DATE}}\n- Time: {{EVENT_TIME}}\n- Where: {{EVENT_LOCATION_NAME}}\n- Address: {{EVENT_LOCATION_ADDRESS}}\n\nWhat''s included:\n- Staff: {{MENU_STAFF}}\n- Family/Guests: {{MENU_FAMILY}}\n\nPlease RSVP by {{RSVP_DEADLINE}}.\n\nRSVP now:\n- Yes: {{RSVP_YES_URL}}\n- No: {{RSVP_NO_URL}}\n- Maybe: {{RSVP_MAYBE_URL}}\n\nThanks,\n{{AGENCY_NAME}} Admin Team\n',
  NULL,
  @platform_branding_id,
  NULL
);
