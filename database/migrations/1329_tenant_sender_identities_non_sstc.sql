-- Migration 1329: Seed ITSCO-parity sender identities for every agency tenant
-- except Summit Stats Team Challenge (and demo playgrounds).
-- Also set Next Level Up dedicated host + ensure agency_email_settings + template maps
-- so job applications / password resets appear in Communications › Automation.

-- ── Tenant domain map (skip ITSCO — already fully seeded; skip SSTC / demo) ──
DROP TEMPORARY TABLE IF EXISTS tmp_tenant_email_seed;
CREATE TEMPORARY TABLE tmp_tenant_email_seed (
  agency_id INT NOT NULL PRIMARY KEY,
  brand_name VARCHAR(255) NOT NULL,
  email_domain VARCHAR(255) NOT NULL,
  brand_short VARCHAR(64) NOT NULL
);

INSERT INTO tmp_tenant_email_seed (agency_id, brand_name, email_domain, brand_short)
SELECT agency_id, brand_name, email_domain, brand_short
FROM (
  SELECT
    a.id AS agency_id,
    COALESCE(NULLIF(TRIM(a.name), ''), a.slug, 'Agency') AS brand_name,
    CASE
      WHEN LOWER(COALESCE(a.slug, a.portal_url, '')) IN ('nlu', 'nextlevelup', 'nextleveluplcc', 'next-level-up')
        THEN 'nextleveluplcc.com'
      WHEN LOWER(COALESCE(a.slug, a.portal_url, '')) IN ('plottwistco', 'plottwist', 'plottwisthq')
        THEN 'plottwistco.com'
      WHEN LOWER(COALESCE(a.slug, a.portal_url, '')) IN (
        'tisi', 'inner-strength', 'innerstrength', 'theinnerstrengthinstitute', 'the-inner-strength-institute'
      ) THEN 'theinnerstrengthinstitute.com'
      WHEN LOWER(COALESCE(a.slug, a.portal_url, '')) IN ('burningsage', 'burning-sage', 'burning_sage')
        THEN 'burningsagetherapy.com'
      WHEN a.onboarding_team_email LIKE '%@%'
        THEN LOWER(SUBSTRING_INDEX(a.onboarding_team_email, '@', -1))
      ELSE NULL
    END AS email_domain,
    CASE
      WHEN LOWER(COALESCE(a.slug, a.portal_url, '')) IN ('nlu', 'nextlevelup', 'nextleveluplcc', 'next-level-up')
        THEN 'NLU'
      WHEN LOWER(COALESCE(a.slug, a.portal_url, '')) IN ('plottwistco', 'plottwist', 'plottwisthq')
        THEN 'PlotTwistCo'
      WHEN LOWER(COALESCE(a.slug, a.portal_url, '')) IN (
        'tisi', 'inner-strength', 'innerstrength', 'theinnerstrengthinstitute', 'the-inner-strength-institute'
      ) THEN 'TISI'
      WHEN LOWER(COALESCE(a.slug, a.portal_url, '')) IN ('burningsage', 'burning-sage', 'burning_sage')
        THEN 'Burning Sage'
      ELSE COALESCE(NULLIF(TRIM(a.name), ''), a.slug, 'Agency')
    END AS brand_short
  FROM agencies a
  WHERE LOWER(COALESCE(a.organization_type, 'agency')) = 'agency'
    AND (a.is_archived = 0 OR a.is_archived IS NULL)
    AND LOWER(COALESCE(a.slug, a.portal_url, '')) NOT IN (
      'itsco',
      'sstc',
      'summit',
      'summit-stats',
      'summitstatsteamchallenge',
      'demo',
      'demo-school'
    )
    AND LOWER(COALESCE(a.slug, a.portal_url, '')) NOT LIKE '%summit%stat%'
    AND LOWER(COALESCE(a.slug, a.portal_url, '')) NOT LIKE 'summit%'
) derived
WHERE email_domain IS NOT NULL
  AND email_domain <> ''
  AND email_domain NOT IN ('example.com', 'example.org', 'test.com', 'localhost');

-- Next Level Up dedicated app host (mirrors ITSCO custom_domain)
UPDATE agencies a
INNER JOIN tmp_tenant_email_seed t ON t.agency_id = a.id
SET
  a.custom_domain = COALESCE(NULLIF(TRIM(a.custom_domain), ''), 'app.nextleveluplcc.com'),
  a.portal_url = 'nextleveluplcc',
  a.onboarding_team_email = COALESCE(
    NULLIF(TRIM(a.onboarding_team_email), ''),
    CONCAT('po@', t.email_domain)
  )
WHERE LOWER(COALESCE(a.slug, a.portal_url, '')) IN ('nlu', 'nextlevelup', 'nextleveluplcc', 'next-level-up');

-- Ensure agency_email_settings rows exist with notifications on
INSERT INTO agency_email_settings (agency_id, notifications_enabled)
SELECT t.agency_id, 1
FROM tmp_tenant_email_seed t
WHERE NOT EXISTS (
  SELECT 1 FROM agency_email_settings s WHERE s.agency_id = t.agency_id
);

UPDATE agency_email_settings s
INNER JOIN tmp_tenant_email_seed t ON t.agency_id = s.agency_id
SET s.notifications_enabled = 1;

-- Helper procedure-less upserts: one INSERT…SELECT + UPDATE per identity_key

-- technology
INSERT INTO email_sender_identities (
  agency_id, identity_key, display_name, from_email, reply_to,
  signature_image_url, signature_image_path, signature_alt_text, is_active
)
SELECT
  t.agency_id, 'technology',
  CONCAT(t.brand_short, ' Technology Team'),
  CONCAT('Technology@', t.email_domain),
  CONCAT('Technology@', t.email_domain),
  NULL, NULL,
  CONCAT(t.brand_short, ' Technology Team'),
  1
FROM tmp_tenant_email_seed t
WHERE NOT EXISTS (
  SELECT 1 FROM email_sender_identities e
  WHERE e.agency_id = t.agency_id AND LOWER(e.identity_key) = 'technology'
);

UPDATE email_sender_identities e
INNER JOIN tmp_tenant_email_seed t ON t.agency_id = e.agency_id
SET
  e.display_name = CONCAT(t.brand_short, ' Technology Team'),
  e.from_email = CONCAT('Technology@', t.email_domain),
  e.reply_to = CONCAT('Technology@', t.email_domain),
  e.signature_alt_text = COALESCE(NULLIF(e.signature_alt_text, ''), CONCAT(t.brand_short, ' Technology Team')),
  e.is_active = 1
WHERE LOWER(e.identity_key) IN ('technology', 'login_recovery');

-- login_recovery (alias of technology mailbox)
INSERT INTO email_sender_identities (
  agency_id, identity_key, display_name, from_email, reply_to,
  signature_image_url, signature_image_path, signature_alt_text, is_active
)
SELECT
  t.agency_id, 'login_recovery',
  CONCAT(t.brand_short, ' Technology Team'),
  CONCAT('Technology@', t.email_domain),
  CONCAT('Technology@', t.email_domain),
  NULL, NULL,
  CONCAT(t.brand_short, ' Technology Team'),
  1
FROM tmp_tenant_email_seed t
WHERE NOT EXISTS (
  SELECT 1 FROM email_sender_identities e
  WHERE e.agency_id = t.agency_id AND LOWER(e.identity_key) = 'login_recovery'
);

-- people_operations
INSERT INTO email_sender_identities (
  agency_id, identity_key, display_name, from_email, reply_to,
  signature_image_url, signature_image_path, signature_alt_text, is_active
)
SELECT
  t.agency_id, 'people_operations',
  CONCAT(t.brand_short, ' People Operations'),
  CONCAT('PO@', t.email_domain),
  CONCAT('PO@', t.email_domain),
  NULL, NULL,
  CONCAT(t.brand_short, ' People Operations'),
  1
FROM tmp_tenant_email_seed t
WHERE NOT EXISTS (
  SELECT 1 FROM email_sender_identities e
  WHERE e.agency_id = t.agency_id AND LOWER(e.identity_key) = 'people_operations'
);

UPDATE email_sender_identities e
INNER JOIN tmp_tenant_email_seed t ON t.agency_id = e.agency_id
SET
  e.display_name = CONCAT(t.brand_short, ' People Operations'),
  e.from_email = CONCAT('PO@', t.email_domain),
  e.reply_to = CONCAT('PO@', t.email_domain),
  e.signature_alt_text = COALESCE(NULLIF(e.signature_alt_text, ''), CONCAT(t.brand_short, ' People Operations')),
  e.is_active = 1
WHERE LOWER(e.identity_key) = 'people_operations';

-- job_applications (People Ops display; Notifications mailbox like ITSCO)
INSERT INTO email_sender_identities (
  agency_id, identity_key, display_name, from_email, reply_to,
  signature_image_url, signature_image_path, signature_alt_text, is_active
)
SELECT
  t.agency_id, 'job_applications',
  CONCAT(t.brand_short, ' - People Operations'),
  CONCAT('notifications@', t.email_domain),
  CONCAT('po@', t.email_domain),
  NULL, NULL,
  CONCAT(t.brand_short, ' People Operations'),
  1
FROM tmp_tenant_email_seed t
WHERE NOT EXISTS (
  SELECT 1 FROM email_sender_identities e
  WHERE e.agency_id = t.agency_id AND LOWER(e.identity_key) = 'job_applications'
);

UPDATE email_sender_identities e
INNER JOIN tmp_tenant_email_seed t ON t.agency_id = e.agency_id
SET
  e.display_name = CONCAT(t.brand_short, ' - People Operations'),
  e.from_email = CONCAT('notifications@', t.email_domain),
  e.reply_to = CONCAT('po@', t.email_domain),
  e.signature_alt_text = COALESCE(NULLIF(e.signature_alt_text, ''), CONCAT(t.brand_short, ' People Operations')),
  e.is_active = 1
WHERE LOWER(e.identity_key) = 'job_applications';

-- notifications
INSERT INTO email_sender_identities (
  agency_id, identity_key, display_name, from_email, reply_to,
  signature_image_url, signature_image_path, signature_alt_text, is_active
)
SELECT
  t.agency_id, 'notifications',
  CONCAT(t.brand_short, ' Notifications Team'),
  CONCAT('Notifications@', t.email_domain),
  CONCAT('PO@', t.email_domain),
  NULL, NULL,
  CONCAT(t.brand_short, ' Notifications Team'),
  1
FROM tmp_tenant_email_seed t
WHERE NOT EXISTS (
  SELECT 1 FROM email_sender_identities e
  WHERE e.agency_id = t.agency_id AND LOWER(e.identity_key) = 'notifications'
);

UPDATE email_sender_identities e
INNER JOIN tmp_tenant_email_seed t ON t.agency_id = e.agency_id
SET
  e.display_name = CONCAT(t.brand_short, ' Notifications Team'),
  e.from_email = CONCAT('Notifications@', t.email_domain),
  e.reply_to = CONCAT('PO@', t.email_domain),
  e.signature_alt_text = COALESCE(NULLIF(e.signature_alt_text, ''), CONCAT(t.brand_short, ' Notifications Team')),
  e.is_active = 1
WHERE LOWER(e.identity_key) = 'notifications';

-- compliance
INSERT INTO email_sender_identities (
  agency_id, identity_key, display_name, from_email, reply_to,
  signature_image_url, signature_image_path, signature_alt_text, is_active
)
SELECT
  t.agency_id, 'compliance',
  CONCAT(t.brand_short, ' Compliance Team'),
  CONCAT('Compliance@', t.email_domain),
  CONCAT('Compliance@', t.email_domain),
  NULL, NULL,
  CONCAT(t.brand_short, ' Compliance Team'),
  1
FROM tmp_tenant_email_seed t
WHERE NOT EXISTS (
  SELECT 1 FROM email_sender_identities e
  WHERE e.agency_id = t.agency_id AND LOWER(e.identity_key) = 'compliance'
);

UPDATE email_sender_identities e
INNER JOIN tmp_tenant_email_seed t ON t.agency_id = e.agency_id
SET
  e.display_name = CONCAT(t.brand_short, ' Compliance Team'),
  e.from_email = CONCAT('Compliance@', t.email_domain),
  e.reply_to = CONCAT('Compliance@', t.email_domain),
  e.signature_alt_text = COALESCE(NULLIF(e.signature_alt_text, ''), CONCAT(t.brand_short, ' Compliance Team')),
  e.is_active = 1
WHERE LOWER(e.identity_key) = 'compliance';

-- payroll
INSERT INTO email_sender_identities (
  agency_id, identity_key, display_name, from_email, reply_to,
  signature_image_url, signature_image_path, signature_alt_text, is_active
)
SELECT
  t.agency_id, 'payroll',
  CONCAT(t.brand_short, ' Payroll Team'),
  CONCAT('Payroll@', t.email_domain),
  CONCAT('Payroll@', t.email_domain),
  NULL, NULL,
  CONCAT(t.brand_short, ' Payroll Team'),
  1
FROM tmp_tenant_email_seed t
WHERE NOT EXISTS (
  SELECT 1 FROM email_sender_identities e
  WHERE e.agency_id = t.agency_id AND LOWER(e.identity_key) = 'payroll'
);

UPDATE email_sender_identities e
INNER JOIN tmp_tenant_email_seed t ON t.agency_id = e.agency_id
SET
  e.display_name = CONCAT(t.brand_short, ' Payroll Team'),
  e.from_email = CONCAT('Payroll@', t.email_domain),
  e.reply_to = CONCAT('Payroll@', t.email_domain),
  e.signature_alt_text = COALESCE(NULLIF(e.signature_alt_text, ''), CONCAT(t.brand_short, ' Payroll Team')),
  e.is_active = 1
WHERE LOWER(e.identity_key) = 'payroll';

-- forms
INSERT INTO email_sender_identities (
  agency_id, identity_key, display_name, from_email, reply_to,
  signature_image_url, signature_image_path, signature_alt_text, is_active
)
SELECT
  t.agency_id, 'forms',
  CONCAT(t.brand_short, ' Forms'),
  CONCAT('forms@', t.email_domain),
  CONCAT('support@', t.email_domain),
  NULL, NULL,
  CONCAT(t.brand_short, ' Forms'),
  1
FROM tmp_tenant_email_seed t
WHERE NOT EXISTS (
  SELECT 1 FROM email_sender_identities e
  WHERE e.agency_id = t.agency_id AND LOWER(e.identity_key) = 'forms'
);

UPDATE email_sender_identities e
INNER JOIN tmp_tenant_email_seed t ON t.agency_id = e.agency_id
SET
  e.display_name = CONCAT(t.brand_short, ' Forms'),
  e.from_email = CONCAT('forms@', t.email_domain),
  e.reply_to = CONCAT('support@', t.email_domain),
  e.signature_alt_text = COALESCE(NULLIF(e.signature_alt_text, ''), CONCAT(t.brand_short, ' Forms')),
  e.is_active = 1
WHERE LOWER(e.identity_key) = 'forms';

-- support
INSERT INTO email_sender_identities (
  agency_id, identity_key, display_name, from_email, reply_to,
  signature_image_url, signature_image_path, signature_alt_text, is_active
)
SELECT
  t.agency_id, 'support',
  CONCAT(t.brand_short, ' Support Team'),
  CONCAT('Support@', t.email_domain),
  CONCAT('Support@', t.email_domain),
  NULL, NULL,
  CONCAT(t.brand_short, ' Support Team'),
  1
FROM tmp_tenant_email_seed t
WHERE NOT EXISTS (
  SELECT 1 FROM email_sender_identities e
  WHERE e.agency_id = t.agency_id AND LOWER(e.identity_key) = 'support'
);

UPDATE email_sender_identities e
INNER JOIN tmp_tenant_email_seed t ON t.agency_id = e.agency_id
SET
  e.display_name = CONCAT(t.brand_short, ' Support Team'),
  e.from_email = CONCAT('Support@', t.email_domain),
  e.reply_to = CONCAT('Support@', t.email_domain),
  e.signature_alt_text = COALESCE(NULLIF(e.signature_alt_text, ''), CONCAT(t.brand_short, ' Support Team')),
  e.is_active = 1
WHERE LOWER(e.identity_key) = 'support';

-- Map high-traffic template types → identities (mirrors ITSCO 1238/1245 + job_applications)
UPDATE agency_email_settings s
INNER JOIN tmp_tenant_email_seed t ON t.agency_id = s.agency_id
SET s.template_sender_identity_json = JSON_SET(
  COALESCE(s.template_sender_identity_json, JSON_OBJECT()),
  '$.password_reset', (
    SELECT e.id FROM email_sender_identities e
    WHERE e.agency_id = t.agency_id AND LOWER(e.identity_key) = 'technology'
    ORDER BY e.id ASC LIMIT 1
  ),
  '$.admin_initiated_password_reset', (
    SELECT e.id FROM email_sender_identities e
    WHERE e.agency_id = t.agency_id AND LOWER(e.identity_key) = 'technology'
    ORDER BY e.id ASC LIMIT 1
  ),
  '$.job_applications', (
    SELECT e.id FROM email_sender_identities e
    WHERE e.agency_id = t.agency_id AND LOWER(e.identity_key) = 'people_operations'
    ORDER BY e.id ASC LIMIT 1
  ),
  '$.compliance_digest', (
    SELECT e.id FROM email_sender_identities e
    WHERE e.agency_id = t.agency_id AND LOWER(e.identity_key) = 'compliance'
    ORDER BY e.id ASC LIMIT 1
  )
);

DROP TEMPORARY TABLE IF EXISTS tmp_tenant_email_seed;
