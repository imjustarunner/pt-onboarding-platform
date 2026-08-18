-- Migration 1232: Session Recording feature (tables, billing_exempt, tenant enablement)

ALTER TABLE user_feature_entitlement_events
  ADD COLUMN billing_exempt TINYINT(1) NOT NULL DEFAULT 0
    COMMENT '1=entitled but not billed (complimentary launch seats)'
  AFTER notes;

ALTER TABLE user_feature_entitlements_current
  ADD COLUMN billing_exempt TINYINT(1) NOT NULL DEFAULT 0
    COMMENT '1=entitled but not billed (complimentary launch seats)'
  AFTER enabled;

CREATE TABLE IF NOT EXISTS session_recordings (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  agency_id INT NOT NULL,
  created_by_user_id INT NOT NULL,
  client_id INT NULL,
  office_event_id INT NULL,
  learning_class_session_id INT NULL,
  session_kind ENUM('tutoring', 'clinical', 'standalone') NOT NULL DEFAULT 'standalone',
  status ENUM('setup', 'recording', 'paused', 'processing', 'completed', 'cancelled') NOT NULL DEFAULT 'setup',
  service_code VARCHAR(32) NULL,
  tool_id VARCHAR(80) NULL,
  note_aid_id VARCHAR(80) NULL,
  session_type_label VARCHAR(160) NULL,
  modality_label VARCHAR(120) NULL,
  date_of_service DATE NULL,
  started_at DATETIME NULL,
  ended_at DATETIME NULL,
  duration_seconds INT NULL,
  auto_transcribe TINYINT(1) NOT NULL DEFAULT 1,
  speaker_identification TINYINT(1) NOT NULL DEFAULT 1,
  generate_structured_note TINYINT(1) NOT NULL DEFAULT 0,
  highlight_interventions TINYINT(1) NOT NULL DEFAULT 1,
  transcript_text LONGTEXT NULL COMMENT 'Encrypted envelope or plaintext transcript',
  summary_text LONGTEXT NULL COMMENT 'Encrypted envelope or plaintext Gemini summary',
  topics_json JSON NULL,
  techniques_json JSON NULL,
  markers_json JSON NULL,
  options_json JSON NULL,
  consent_id BIGINT UNSIGNED NULL,
  error_message VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_session_recordings_agency_user (agency_id, created_by_user_id, created_at),
  KEY idx_session_recordings_client (client_id, created_at),
  KEY idx_session_recordings_office_event (office_event_id),
  KEY idx_session_recordings_learning_session (learning_class_session_id),
  KEY idx_session_recordings_status (agency_id, status),
  CONSTRAINT fk_session_recordings_agency
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_session_recordings_user
    FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS session_recording_notes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  session_recording_id BIGINT UNSIGNED NOT NULL,
  agency_id INT NOT NULL,
  created_by_user_id INT NOT NULL,
  tool_id VARCHAR(80) NOT NULL,
  service_code VARCHAR(32) NULL,
  note_aid_id VARCHAR(80) NULL,
  output_json LONGTEXT NULL COMMENT 'Encrypted envelope or plaintext structured note',
  archived_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_session_recording_notes_recording (session_recording_id, created_at),
  KEY idx_session_recording_notes_user (created_by_user_id, agency_id, created_at),
  CONSTRAINT fk_session_recording_notes_recording
    FOREIGN KEY (session_recording_id) REFERENCES session_recordings(id) ON DELETE CASCADE,
  CONSTRAINT fk_session_recording_notes_agency
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_session_recording_notes_user
    FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS session_recording_consents (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  agency_id INT NOT NULL,
  client_id INT NULL,
  session_recording_id BIGINT UNSIGNED NULL,
  signer_full_name VARCHAR(255) NOT NULL,
  signer_dob DATE NOT NULL,
  signer_dob_hash CHAR(64) NULL,
  matched_by ENUM('client_id', 'name_dob', 'manual', 'none') NOT NULL DEFAULT 'none',
  document_template_id INT NULL,
  task_id INT NULL,
  signed_document_id INT NULL,
  signed_at DATETIME NULL,
  created_by_user_id INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_src_agency_client (agency_id, client_id),
  KEY idx_src_agency_name_dob (agency_id, signer_full_name, signer_dob),
  KEY idx_src_dob_hash (agency_id, signer_dob_hash),
  KEY idx_src_task (task_id),
  KEY idx_src_signed_doc (signed_document_id),
  CONSTRAINT fk_src_agency
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_src_user
    FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE session_recordings
  ADD CONSTRAINT fk_session_recordings_consent
    FOREIGN KEY (consent_id) REFERENCES session_recording_consents(id)
    ON DELETE SET NULL;

-- Enable feature for ITSCO (2) and NLU (6)
UPDATE agencies
SET feature_flags = JSON_SET(COALESCE(feature_flags, JSON_OBJECT()), '$.sessionRecordingEnabled', true)
WHERE id IN (2, 6);

INSERT INTO agency_feature_entitlement_events
  (agency_id, feature_key, event_type, actor_user_id, actor_role, effective_at, notes)
SELECT a.id, 'sessionRecording', 'enabled', NULL, 'system', NOW(),
       'Launch enablement for Session Recording'
FROM agencies a
WHERE a.id IN (2, 6)
  AND NOT EXISTS (
    SELECT 1 FROM agency_feature_entitlements_current c
    WHERE c.agency_id = a.id AND c.feature_key = 'sessionRecording' AND c.enabled = 1
  );

INSERT INTO agency_feature_entitlements_current (agency_id, feature_key, enabled, last_event_id)
SELECT e.agency_id, e.feature_key, 1, e.id
FROM agency_feature_entitlement_events e
INNER JOIN (
  SELECT agency_id, MAX(id) AS max_id
  FROM agency_feature_entitlement_events
  WHERE feature_key = 'sessionRecording' AND event_type = 'enabled'
  GROUP BY agency_id
) latest ON latest.max_id = e.id
ON DUPLICATE KEY UPDATE
  enabled = 1,
  last_event_id = VALUES(last_event_id),
  updated_at = CURRENT_TIMESTAMP;

-- ITSCO complimentary seats: admin, super_admin, CPA, provider_plus
INSERT INTO user_feature_entitlement_events
  (agency_id, user_id, feature_key, event_type, actor_user_id, actor_role, effective_at, notes, billing_exempt)
SELECT ua.agency_id, ua.user_id, 'sessionRecording', 'enabled', NULL, 'system', NOW(),
       'Complimentary launch seat', 1
FROM user_agencies ua
JOIN users u ON u.id = ua.user_id
WHERE ua.agency_id = 2
  AND LOWER(COALESCE(NULLIF(ua.agency_role, ''), u.role)) IN (
    'admin', 'super_admin', 'clinical_practice_assistant', 'provider_plus'
  )
  AND COALESCE(u.is_active, 1) = 1
  AND COALESCE(ua.is_active, 1) = 1
  AND NOT EXISTS (
    SELECT 1 FROM user_feature_entitlements_current c
    WHERE c.user_id = ua.user_id AND c.feature_key = 'sessionRecording' AND c.enabled = 1
  );

-- NLU complimentary seats: all employee users
INSERT INTO user_feature_entitlement_events
  (agency_id, user_id, feature_key, event_type, actor_user_id, actor_role, effective_at, notes, billing_exempt)
SELECT ua.agency_id, ua.user_id, 'sessionRecording', 'enabled', NULL, 'system', NOW(),
       'Complimentary launch seat (NLU)', 1
FROM user_agencies ua
JOIN users u ON u.id = ua.user_id
WHERE ua.agency_id = 6
  AND LOWER(COALESCE(NULLIF(ua.agency_role, ''), u.role)) NOT IN (
    'client', 'client_guardian', 'kiosk', 'athlete'
  )
  AND COALESCE(u.is_active, 1) = 1
  AND COALESCE(ua.is_active, 1) = 1
  AND NOT EXISTS (
    SELECT 1 FROM user_feature_entitlements_current c
    WHERE c.user_id = ua.user_id AND c.feature_key = 'sessionRecording' AND c.enabled = 1
  );

INSERT INTO user_feature_entitlements_current
  (user_id, feature_key, agency_id, enabled, billing_exempt, last_event_id)
SELECT e.user_id, e.feature_key, e.agency_id, 1, 1, e.id
FROM user_feature_entitlement_events e
INNER JOIN (
  SELECT user_id, feature_key, MAX(id) AS max_id
  FROM user_feature_entitlement_events
  WHERE feature_key = 'sessionRecording' AND event_type = 'enabled'
  GROUP BY user_id, feature_key
) latest ON latest.max_id = e.id
ON DUPLICATE KEY UPDATE
  enabled = 1,
  billing_exempt = 1,
  agency_id = VALUES(agency_id),
  last_event_id = VALUES(last_event_id),
  updated_at = CURRENT_TIMESTAMP;

-- Seed NLU audio recording consent templates (ITSCO already has them in Documents)
SET @seed_user_id = (
  SELECT id FROM users
  WHERE role IN ('super_admin', 'admin')
  ORDER BY FIELD(role, 'super_admin', 'admin'), id ASC
  LIMIT 1
);

INSERT INTO document_templates (
  name, description, version, template_type, file_path, html_content,
  agency_id, created_by_user_id, is_active, document_type, document_action_type
)
SELECT
  'Audio Recording Consent (Adult)',
  'Consent to audio recording of tutoring or clinical sessions for documentation.',
  1,
  'html',
  NULL,
  '<h1>Audio Recording Consent</h1>
<p>I consent to audio recording of this session for the purpose of creating an accurate session summary and related documentation. I understand:</p>
<ul>
  <li>Audio is transcribed and then deleted; recordings are not retained long-term.</li>
  <li>Transcript and summary text may be stored encrypted for documentation.</li>
  <li>I may withdraw consent for future sessions by notifying the provider.</li>
</ul>
<p>By signing, I acknowledge I have read and agree to this consent.</p>',
  6,
  @seed_user_id,
  TRUE,
  'audio_recording_consent',
  'signature'
FROM DUAL
WHERE @seed_user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM document_templates
    WHERE agency_id = 6
      AND document_type = 'audio_recording_consent'
      AND name = 'Audio Recording Consent (Adult)'
      AND is_active = TRUE
    LIMIT 1
  );

INSERT INTO document_templates (
  name, description, version, template_type, file_path, html_content,
  agency_id, created_by_user_id, is_active, document_type, document_action_type
)
SELECT
  'Audio Recording Consent (Minor / Guardian)',
  'Guardian consent to audio recording of a minor''s session for documentation.',
  1,
  'html',
  NULL,
  '<h1>Audio Recording Consent (Minor)</h1>
<p>I am the parent/guardian of the participant and consent to audio recording of this session for documentation purposes. I understand:</p>
<ul>
  <li>Audio is transcribed and then deleted; recordings are not retained long-term.</li>
  <li>Transcript and summary text may be stored encrypted for documentation.</li>
  <li>I may withdraw consent for future sessions by notifying the provider.</li>
</ul>
<p>By signing, I acknowledge I have read and agree to this consent on behalf of the minor.</p>',
  6,
  @seed_user_id,
  TRUE,
  'audio_recording_consent',
  'signature'
FROM DUAL
WHERE @seed_user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM document_templates
    WHERE agency_id = 6
      AND document_type = 'audio_recording_consent'
      AND name = 'Audio Recording Consent (Minor / Guardian)'
      AND is_active = TRUE
    LIMIT 1
  );
