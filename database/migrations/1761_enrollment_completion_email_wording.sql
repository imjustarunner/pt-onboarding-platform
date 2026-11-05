-- Migration 1761: family completion emails say enrollment, not intake; ITSCO school mail signs as Schools Team
UPDATE email_sender_identities
SET display_name = 'Schools Team'
WHERE agency_id = 2 AND identity_key = 'schools' AND display_name = 'Schools';

UPDATE email_templates
SET subject = '{{CLIENT_NAME}} - Enrollment packet completed',
    body = 'Hello {{SIGNER_NAME}},

Thank you for completing your enrollment packet with ITSCO.
{{CLIENT_SUMMARY}}

Your signed enrollment packet is ready to download here:
{{DOWNLOAD_URL}}

For security, this link expires in {{LINK_EXPIRES_DAYS}} days.

If you have any questions, reply to this email or contact our support team.
- ITSCO Care Team'
WHERE type = 'intake_packet_default' AND agency_id IS NULL;

UPDATE email_templates
SET subject = '{{SCHOOL_NAME}} - School enrollment packet completed',
    body = 'Hello {{SIGNER_NAME}},

Thank you for completing the school enrollment packet for {{SCHOOL_NAME}}.
{{CLIENT_SUMMARY}}

Your signed enrollment packet is ready to download here:
{{DOWNLOAD_URL}}

For security, this link expires in {{LINK_EXPIRES_DAYS}} days.

If you have any questions, reply to this email or contact our support team.
- ITSCO Care Team'
WHERE type = 'school_full_intake_packet_default' AND agency_id IS NULL;

UPDATE email_templates
SET subject = 'Your {{AGENCY_NAME}} enrollment',
    body = REPLACE(body, 'Thank you for completing intake with', 'Thank you for completing enrollment with')
WHERE type = 'intake' AND agency_id IS NULL;
