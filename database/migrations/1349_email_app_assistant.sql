-- Migration 1349: Email App Assistant (app@tenant) — inbound Q&A + tasks via email
-- Replies from app@<tenant-domain>. Feature flag: emailAppAssistantEnabled.
-- Catalog/billing key: emailAppAssistant.

-- Pending clarifications / multi-turn email threads per user+tenant
CREATE TABLE IF NOT EXISTS app_email_sessions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  agency_id INT NOT NULL,
  user_id INT NOT NULL,
  intent_key VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  state_json JSON NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_app_email_session_user (agency_id, user_id),
  KEY idx_app_email_session_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Domain map for current agency tenants (skip SSTC / demo playgrounds)
DROP TEMPORARY TABLE IF EXISTS tmp_app_email_seed;
CREATE TEMPORARY TABLE tmp_app_email_seed (
  agency_id INT NOT NULL PRIMARY KEY,
  brand_name VARCHAR(255) NOT NULL,
  email_domain VARCHAR(255) NOT NULL,
  brand_short VARCHAR(64) NOT NULL
);

INSERT INTO tmp_app_email_seed (agency_id, brand_name, email_domain, brand_short)
SELECT agency_id, brand_name, email_domain, brand_short
FROM (
  SELECT
    a.id AS agency_id,
    COALESCE(NULLIF(TRIM(a.name), ''), a.slug, 'Agency') AS brand_name,
    CASE
      WHEN LOWER(COALESCE(a.slug, a.portal_url, '')) IN ('itsco')
        THEN 'itsco.health'
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
      WHEN a.support_team_email LIKE '%@%'
        THEN LOWER(SUBSTRING_INDEX(a.support_team_email, '@', -1))
      ELSE NULL
    END AS email_domain,
    CASE
      WHEN LOWER(COALESCE(a.slug, a.portal_url, '')) IN ('itsco') THEN 'ITSCO'
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
      'sstc', 'summit', 'summit-stats', 'summitstatsteamchallenge', 'demo', 'demo-school'
    )
    AND LOWER(COALESCE(a.slug, a.portal_url, '')) NOT LIKE '%summit%stat%'
) derived
WHERE email_domain IS NOT NULL
  AND email_domain <> ''
  AND email_domain NOT IN ('example.com', 'example.org', 'test.com', 'localhost');

-- Sender identity: app@tenant
INSERT INTO email_sender_identities (
  agency_id, identity_key, display_name, from_email, reply_to,
  inbound_addresses_json, is_active
)
SELECT
  t.agency_id,
  'app',
  CONCAT(t.brand_short, ' App'),
  CONCAT('app@', t.email_domain),
  CONCAT('app@', t.email_domain),
  JSON_ARRAY(CONCAT('app@', t.email_domain)),
  1
FROM tmp_app_email_seed t
WHERE NOT EXISTS (
  SELECT 1 FROM email_sender_identities e
  WHERE e.agency_id = t.agency_id AND LOWER(e.identity_key) = 'app'
);

UPDATE email_sender_identities e
INNER JOIN tmp_app_email_seed t ON t.agency_id = e.agency_id
SET
  e.display_name = CONCAT(t.brand_short, ' App'),
  e.from_email = CONCAT('app@', t.email_domain),
  e.reply_to = CONCAT('app@', t.email_domain),
  e.inbound_addresses_json = JSON_ARRAY(CONCAT('app@', t.email_domain)),
  e.is_active = 1
WHERE LOWER(e.identity_key) = 'app';

-- Inbound routes so Gmail poll matches To: app@tenant
INSERT INTO email_inbound_routes (sender_identity_id, email_address, is_active)
SELECT e.id, CONCAT('app@', t.email_domain), TRUE
FROM email_sender_identities e
INNER JOIN tmp_app_email_seed t ON t.agency_id = e.agency_id
WHERE LOWER(e.identity_key) = 'app'
  AND NOT EXISTS (
    SELECT 1 FROM email_inbound_routes r
    WHERE LOWER(r.email_address) = CONCAT('app@', t.email_domain)
      AND r.sender_identity_id = e.id
      AND r.is_active = TRUE
  );

-- Enable feature for seeded tenants
UPDATE agencies a
INNER JOIN tmp_app_email_seed t ON t.agency_id = a.id
SET a.feature_flags = JSON_SET(
  COALESCE(a.feature_flags, JSON_OBJECT()),
  '$.emailAppAssistantEnabled',
  TRUE
);

INSERT INTO agency_feature_entitlement_events
  (agency_id, feature_key, event_type, actor_user_id, actor_role, effective_at, notes)
SELECT t.agency_id, 'emailAppAssistant', 'enabled', NULL, 'system', NOW(),
       'Launch enablement for Email App Assistant (app@tenant)'
FROM tmp_app_email_seed t
WHERE NOT EXISTS (
  SELECT 1 FROM agency_feature_entitlements_current c
  WHERE c.agency_id = t.agency_id AND c.feature_key = 'emailAppAssistant' AND c.enabled = 1
);

INSERT INTO agency_feature_entitlements_current (agency_id, feature_key, enabled, last_event_id)
SELECT e.agency_id, e.feature_key, 1, e.id
FROM agency_feature_entitlement_events e
INNER JOIN (
  SELECT agency_id, MAX(id) AS max_id
  FROM agency_feature_entitlement_events
  WHERE feature_key = 'emailAppAssistant' AND event_type = 'enabled'
  GROUP BY agency_id
) latest ON latest.max_id = e.id
INNER JOIN tmp_app_email_seed t ON t.agency_id = e.agency_id
ON DUPLICATE KEY UPDATE
  enabled = 1,
  last_event_id = VALUES(last_event_id),
  updated_at = CURRENT_TIMESTAMP;

DROP TEMPORARY TABLE IF EXISTS tmp_app_email_seed;
