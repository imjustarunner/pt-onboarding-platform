-- NLU's Compliance mailbox now has send-as permission. Preserve existing brand assets.
UPDATE email_sender_identities e
JOIN agencies a ON a.id = e.agency_id
SET e.from_email = 'Compliance@nextleveluplcc.com',
    e.reply_to = 'Compliance@nextleveluplcc.com',
    e.display_name = 'NLU Compliance Team',
    e.is_active = 1
WHERE LOWER(e.identity_key) = 'compliance'
  AND (LOWER(COALESCE(a.slug, '')) IN ('nlu', 'nextlevelup', 'nextleveluplcc', 'next-level-up')
    OR LOWER(COALESCE(a.portal_url, '')) IN ('nlu', 'nextlevelup', 'nextleveluplcc', 'next-level-up'));

UPDATE agency_email_settings s
JOIN email_sender_identities e ON e.agency_id = s.agency_id AND e.identity_key = 'compliance'
SET s.template_sender_identity_json = JSON_SET(
  COALESCE(s.template_sender_identity_json, JSON_OBJECT()), '$.compliance_digest', e.id
)
WHERE e.from_email = 'Compliance@nextleveluplcc.com';
