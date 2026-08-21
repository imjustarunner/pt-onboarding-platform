-- Migration 1269: unfinished digital enrollment form reminders + anonymous deletion audit

ALTER TABLE intake_submissions
  ADD COLUMN reminder_consent_status VARCHAR(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL
    COMMENT 'agreed | declined | null (legacy/not asked)',
  ADD COLUMN reminder_consent_at TIMESTAMP NULL DEFAULT NULL
    COMMENT 'When the person answered the unfinished-form reminder agreement',
  ADD COLUMN draft_expires_at TIMESTAMP NULL DEFAULT NULL
    COMMENT 'When this unfinished draft is permanently deleted (12h if declined, 10d if agreed)',
  ADD COLUMN reminder_24h_sent_at TIMESTAMP NULL DEFAULT NULL,
  ADD COLUMN reminder_72h_sent_at TIMESTAMP NULL DEFAULT NULL,
  ADD COLUMN reminder_7d_sent_at TIMESTAMP NULL DEFAULT NULL,
  ADD COLUMN reminder_opt_out_at TIMESTAMP NULL DEFAULT NULL
    COMMENT 'When they requested stop notifying + delete forever',
  ADD COLUMN deletion_token_hash CHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL
    COMMENT 'SHA-256 hex of one-time deletion link token',
  ADD COLUMN deletion_token_expires_at TIMESTAMP NULL DEFAULT NULL,
  ADD COLUMN school_organization_id INT NULL DEFAULT NULL
    COMMENT 'Denormalized school org for unfinished reports (nullable for office)',
  ADD COLUMN reminder_first_name VARCHAR(120) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL
    COMMENT 'First name captured for reminder emails (encrypted row may null signer_name)',
  ADD INDEX idx_intake_submissions_draft_expiry (status, draft_expires_at),
  ADD INDEX idx_intake_submissions_reminder_due (status, reminder_consent_status, reminder_consent_at),
  ADD INDEX idx_intake_submissions_deletion_token (deletion_token_hash);

CREATE TABLE IF NOT EXISTS unfinished_form_reminder_events (
  id BIGINT NOT NULL AUTO_INCREMENT,
  intake_submission_id INT NOT NULL,
  agency_id INT NOT NULL,
  school_organization_id INT NULL,
  reminder_slot VARCHAR(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL
    COMMENT '24h | 72h | 7d',
  status VARCHAR(24) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'sent'
    COMMENT 'sent | failed | skipped',
  subject VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  to_email_domain VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL
    COMMENT 'Domain only — never store full email here long-term beyond send moment in user_communications',
  error_message VARCHAR(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  sent_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_ufre_submission (intake_submission_id),
  KEY idx_ufre_agency (agency_id, sent_at),
  KEY idx_ufre_school (school_organization_id, sent_at),
  CONSTRAINT fk_ufre_submission FOREIGN KEY (intake_submission_id) REFERENCES intake_submissions(id) ON DELETE CASCADE,
  CONSTRAINT fk_ufre_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Anonymous only: no name, email, token, or form content
CREATE TABLE IF NOT EXISTS unfinished_form_deletion_audits (
  id BIGINT NOT NULL AUTO_INCREMENT,
  agency_id INT NOT NULL,
  school_organization_id INT NULL,
  scope_type VARCHAR(24) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'unknown'
    COMMENT 'school | office | unknown',
  reason VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'user_opt_out'
    COMMENT 'user_opt_out | draft_expired | staff_purge',
  deleted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_ufda_agency (agency_id, deleted_at),
  KEY idx_ufda_school (school_organization_id, deleted_at),
  CONSTRAINT fk_ufda_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Align ITSCO Forms sender with product requirements
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

INSERT INTO email_sender_identities (
  agency_id, identity_key, display_name, from_email, reply_to,
  signature_image_url, signature_image_path, signature_alt_text, is_active
)
SELECT
  @itsco_id, 'forms', 'ITSCO Forms',
  'forms@itsco.health', 'support@itsco.health',
  NULL, NULL, 'ITSCO Forms', 1
FROM DUAL
WHERE @itsco_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM email_sender_identities
    WHERE agency_id = @itsco_id AND LOWER(identity_key) = 'forms'
  );

UPDATE email_sender_identities
SET display_name = 'ITSCO Forms',
    from_email = 'forms@itsco.health',
    reply_to = 'support@itsco.health',
    is_active = 1
WHERE agency_id = @itsco_id AND LOWER(identity_key) = 'forms';
