-- Explicit coaching scope prevents office clinical screens and default clinical support contacts.
UPDATE intake_links l JOIN agencies a ON a.id=l.organization_id
SET l.custom_messages=JSON_SET(COALESCE(l.custom_messages,JSON_OBJECT()),'$.serviceScope','coaching')
WHERE a.slug='kimi' AND a.organization_type='life_coach' AND a.account_owner_user_id=532
AND l.public_key IN ('kimi-coaching-inquiry','kimi-coaching-enrollment');
