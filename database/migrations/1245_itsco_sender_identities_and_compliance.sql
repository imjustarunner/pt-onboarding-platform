-- Migration 1245: ITSCO sender identities (Compliance, Notifications, Payroll, Forms, Support,
-- Schools, SchoolReply, People Operations) + payroll compliance unlock + notification mutes.

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

ALTER TABLE agencies
  ADD COLUMN payroll_compliance_unlocked_at TIMESTAMP NULL DEFAULT NULL
  COMMENT 'Set when payroll processor first selects the unlock pay period (ITSCO 2026-08-15 to 2026-08-28)';

CREATE TABLE IF NOT EXISTS agency_compliance_notification_mutes (
  id INT NOT NULL AUTO_INCREMENT,
  agency_id INT NOT NULL,
  provider_user_id INT NOT NULL,
  client_id INT NOT NULL,
  mute_type VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'session_limit'
    COMMENT 'session_limit | late_note (future)',
  muted_by_user_id INT NULL,
  muted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_compliance_mute (agency_id, provider_user_id, client_id, mute_type),
  KEY idx_compliance_mute_agency (agency_id),
  KEY idx_compliance_mute_provider (provider_user_id),
  CONSTRAINT fk_acm_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_acm_provider FOREIGN KEY (provider_user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_acm_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  CONSTRAINT fk_acm_muted_by FOREIGN KEY (muted_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Helper: upsert one identity
-- compliance
INSERT INTO email_sender_identities (
  agency_id, identity_key, display_name, from_email, reply_to,
  signature_image_url, signature_image_path, signature_alt_text, is_active
)
SELECT
  @itsco_id, 'compliance', 'ITSCO Compliance Team',
  'Compliance@ITSCO.health', 'Compliance@ITSCO.health',
  '/email-signatures/itsco-compliance-team.png',
  '/email-signatures/itsco-compliance-team.png',
  'ITSCO Compliance Team', 1
FROM DUAL
WHERE @itsco_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM email_sender_identities
    WHERE agency_id = @itsco_id AND LOWER(identity_key) = 'compliance'
  );

UPDATE email_sender_identities
SET display_name = 'ITSCO Compliance Team',
    from_email = 'Compliance@ITSCO.health',
    reply_to = 'Compliance@ITSCO.health',
    signature_image_url = COALESCE(NULLIF(signature_image_url, ''), '/email-signatures/itsco-compliance-team.png'),
    signature_image_path = COALESCE(NULLIF(signature_image_path, ''), '/email-signatures/itsco-compliance-team.png'),
    signature_alt_text = COALESCE(NULLIF(signature_alt_text, ''), 'ITSCO Compliance Team'),
    is_active = 1
WHERE agency_id = @itsco_id AND LOWER(identity_key) = 'compliance';

-- notifications
INSERT INTO email_sender_identities (
  agency_id, identity_key, display_name, from_email, reply_to,
  signature_image_url, signature_image_path, signature_alt_text, is_active
)
SELECT
  @itsco_id, 'notifications', 'ITSCO Notifications Team',
  'Notifications@ITSCO.health', 'PO@ITSCO.health',
  '/email-signatures/itsco-notifications-team.png',
  '/email-signatures/itsco-notifications-team.png',
  'ITSCO Notifications Team', 1
FROM DUAL
WHERE @itsco_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM email_sender_identities
    WHERE agency_id = @itsco_id AND LOWER(identity_key) = 'notifications'
  );

UPDATE email_sender_identities
SET display_name = 'ITSCO Notifications Team',
    from_email = 'Notifications@ITSCO.health',
    reply_to = 'PO@ITSCO.health',
    signature_image_url = COALESCE(NULLIF(signature_image_url, ''), '/email-signatures/itsco-notifications-team.png'),
    signature_image_path = COALESCE(NULLIF(signature_image_path, ''), '/email-signatures/itsco-notifications-team.png'),
    signature_alt_text = COALESCE(NULLIF(signature_alt_text, ''), 'ITSCO Notifications Team'),
    is_active = 1
WHERE agency_id = @itsco_id AND LOWER(identity_key) = 'notifications';

-- payroll
INSERT INTO email_sender_identities (
  agency_id, identity_key, display_name, from_email, reply_to,
  signature_image_url, signature_image_path, signature_alt_text, is_active
)
SELECT
  @itsco_id, 'payroll', 'ITSCO Payroll Team',
  'Payroll@ITSCO.health', 'Payroll@ITSCO.health',
  '/email-signatures/itsco-payroll-team.png',
  '/email-signatures/itsco-payroll-team.png',
  'ITSCO Payroll Team', 1
FROM DUAL
WHERE @itsco_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM email_sender_identities
    WHERE agency_id = @itsco_id AND LOWER(identity_key) = 'payroll'
  );

UPDATE email_sender_identities
SET display_name = 'ITSCO Payroll Team',
    from_email = 'Payroll@ITSCO.health',
    reply_to = 'Payroll@ITSCO.health',
    signature_image_url = COALESCE(NULLIF(signature_image_url, ''), '/email-signatures/itsco-payroll-team.png'),
    signature_image_path = COALESCE(NULLIF(signature_image_path, ''), '/email-signatures/itsco-payroll-team.png'),
    signature_alt_text = COALESCE(NULLIF(signature_alt_text, ''), 'ITSCO Payroll Team'),
    is_active = 1
WHERE agency_id = @itsco_id AND LOWER(identity_key) = 'payroll';

-- forms
INSERT INTO email_sender_identities (
  agency_id, identity_key, display_name, from_email, reply_to,
  signature_image_url, signature_image_path, signature_alt_text, is_active
)
SELECT
  @itsco_id, 'forms', 'ITSCO Forms Team',
  'Forms@ITSCO.health', 'Forms@ITSCO.health',
  '/email-signatures/itsco-forms-team.png',
  '/email-signatures/itsco-forms-team.png',
  'ITSCO Forms Team', 1
FROM DUAL
WHERE @itsco_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM email_sender_identities
    WHERE agency_id = @itsco_id AND LOWER(identity_key) = 'forms'
  );

UPDATE email_sender_identities
SET display_name = 'ITSCO Forms Team',
    from_email = 'Forms@ITSCO.health',
    reply_to = 'Forms@ITSCO.health',
    signature_image_url = COALESCE(NULLIF(signature_image_url, ''), '/email-signatures/itsco-forms-team.png'),
    signature_image_path = COALESCE(NULLIF(signature_image_path, ''), '/email-signatures/itsco-forms-team.png'),
    signature_alt_text = COALESCE(NULLIF(signature_alt_text, ''), 'ITSCO Forms Team'),
    is_active = 1
WHERE agency_id = @itsco_id AND LOWER(identity_key) = 'forms';

-- support
INSERT INTO email_sender_identities (
  agency_id, identity_key, display_name, from_email, reply_to,
  signature_image_url, signature_image_path, signature_alt_text, is_active
)
SELECT
  @itsco_id, 'support', 'ITSCO Support Team',
  'Support@ITSCO.health', 'Support@ITSCO.health',
  '/email-signatures/itsco-support-team.png',
  '/email-signatures/itsco-support-team.png',
  'ITSCO Support Team', 1
FROM DUAL
WHERE @itsco_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM email_sender_identities
    WHERE agency_id = @itsco_id AND LOWER(identity_key) = 'support'
  );

UPDATE email_sender_identities
SET display_name = 'ITSCO Support Team',
    from_email = 'Support@ITSCO.health',
    reply_to = 'Support@ITSCO.health',
    signature_image_url = COALESCE(NULLIF(signature_image_url, ''), '/email-signatures/itsco-support-team.png'),
    signature_image_path = COALESCE(NULLIF(signature_image_path, ''), '/email-signatures/itsco-support-team.png'),
    signature_alt_text = COALESCE(NULLIF(signature_alt_text, ''), 'ITSCO Support Team'),
    is_active = 1
WHERE agency_id = @itsco_id AND LOWER(identity_key) = 'support';

-- schools
INSERT INTO email_sender_identities (
  agency_id, identity_key, display_name, from_email, reply_to,
  signature_image_url, signature_image_path, signature_alt_text, is_active
)
SELECT
  @itsco_id, 'schools', 'ITSCO Schools Team',
  'Schools@ITSCO.health', 'Schools@ITSCO.health',
  '/email-signatures/itsco-schools-team.png',
  '/email-signatures/itsco-schools-team.png',
  'ITSCO Schools Team', 1
FROM DUAL
WHERE @itsco_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM email_sender_identities
    WHERE agency_id = @itsco_id AND LOWER(identity_key) = 'schools'
  );

UPDATE email_sender_identities
SET display_name = 'ITSCO Schools Team',
    from_email = 'Schools@ITSCO.health',
    reply_to = 'Schools@ITSCO.health',
    signature_image_url = COALESCE(NULLIF(signature_image_url, ''), '/email-signatures/itsco-schools-team.png'),
    signature_image_path = COALESCE(NULLIF(signature_image_path, ''), '/email-signatures/itsco-schools-team.png'),
    signature_alt_text = COALESCE(NULLIF(signature_alt_text, ''), 'ITSCO Schools Team'),
    is_active = 1
WHERE agency_id = @itsco_id AND LOWER(identity_key) = 'schools';

-- schoolreply
INSERT INTO email_sender_identities (
  agency_id, identity_key, display_name, from_email, reply_to,
  signature_image_url, signature_image_path, signature_alt_text, is_active
)
SELECT
  @itsco_id, 'schoolreply', 'ITSCO SchoolReply Team',
  'SchoolReply@ITSCO.health', 'Schools@ITSCO.health',
  '/email-signatures/itsco-schoolreply-team.png',
  '/email-signatures/itsco-schoolreply-team.png',
  'ITSCO SchoolReply Team', 1
FROM DUAL
WHERE @itsco_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM email_sender_identities
    WHERE agency_id = @itsco_id AND LOWER(identity_key) = 'schoolreply'
  );

UPDATE email_sender_identities
SET display_name = 'ITSCO SchoolReply Team',
    from_email = 'SchoolReply@ITSCO.health',
    reply_to = 'Schools@ITSCO.health',
    signature_image_url = COALESCE(NULLIF(signature_image_url, ''), '/email-signatures/itsco-schoolreply-team.png'),
    signature_image_path = COALESCE(NULLIF(signature_image_path, ''), '/email-signatures/itsco-schoolreply-team.png'),
    signature_alt_text = COALESCE(NULLIF(signature_alt_text, ''), 'ITSCO SchoolReply Team'),
    is_active = 1
WHERE agency_id = @itsco_id AND LOWER(identity_key) = 'schoolreply';

-- people_operations
INSERT INTO email_sender_identities (
  agency_id, identity_key, display_name, from_email, reply_to,
  signature_image_url, signature_image_path, signature_alt_text, is_active
)
SELECT
  @itsco_id, 'people_operations', 'ITSCO People Operations',
  'PO@ITSCO.health', 'PO@ITSCO.health',
  '/email-signatures/itsco-people-operations.png',
  '/email-signatures/itsco-people-operations.png',
  'ITSCO People Operations', 1
FROM DUAL
WHERE @itsco_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM email_sender_identities
    WHERE agency_id = @itsco_id AND LOWER(identity_key) = 'people_operations'
  );

UPDATE email_sender_identities
SET display_name = 'ITSCO People Operations',
    from_email = 'PO@ITSCO.health',
    reply_to = 'PO@ITSCO.health',
    signature_image_url = COALESCE(NULLIF(signature_image_url, ''), '/email-signatures/itsco-people-operations.png'),
    signature_image_path = COALESCE(NULLIF(signature_image_path, ''), '/email-signatures/itsco-people-operations.png'),
    signature_alt_text = COALESCE(NULLIF(signature_alt_text, ''), 'ITSCO People Operations'),
    is_active = 1
WHERE agency_id = @itsco_id AND LOWER(identity_key) = 'people_operations';

INSERT INTO agency_email_settings (agency_id, notifications_enabled)
SELECT @itsco_id, 1
FROM DUAL
WHERE @itsco_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM agency_email_settings WHERE agency_id = @itsco_id
  );

SET @compliance_id = (
  SELECT id FROM email_sender_identities
  WHERE agency_id = @itsco_id AND LOWER(identity_key) = 'compliance'
  ORDER BY id ASC
  LIMIT 1
);

UPDATE agency_email_settings
SET notifications_enabled = 1,
    template_sender_identity_json = JSON_SET(
      COALESCE(template_sender_identity_json, JSON_OBJECT()),
      '$.compliance_digest', @compliance_id
    )
WHERE agency_id = @itsco_id
  AND @compliance_id IS NOT NULL;
