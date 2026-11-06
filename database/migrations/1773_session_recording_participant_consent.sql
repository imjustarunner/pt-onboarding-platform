-- Session-bound capture: executed participant waivers and clinician confirmation.
ALTER TABLE session_recordings
  ADD COLUMN clinical_session_id BIGINT NULL,
  ADD COLUMN session_context_key VARCHAR(120) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  ADD COLUMN recording_revision INT NOT NULL DEFAULT 0,
  ADD COLUMN confirmed_revision INT NULL,
  ADD COLUMN confirmed_by_user_id INT NULL,
  ADD COLUMN confirmed_at DATETIME NULL,
  ADD COLUMN capture_paused TINYINT NOT NULL DEFAULT 1,
  ADD UNIQUE KEY session_recording_context_owner (agency_id,created_by_user_id,session_context_key);

CREATE TABLE IF NOT EXISTS session_recording_participants (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  session_recording_id BIGINT UNSIGNED NOT NULL,
  participant_key VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  client_id INT NULL,
  participant_type VARCHAR(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  name_encrypted LONGTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  required_signature TINYINT NOT NULL DEFAULT 1,
  signer_user_id INT NULL,
  signer_relationship VARCHAR(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  legacy_consent_id BIGINT UNSIGNED NULL,
  document_template_id INT NULL,
  document_hash CHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  document_encrypted LONGTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  signature_encrypted LONGTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  signed_pdf_path VARCHAR(1024) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  signed_at DATETIME NULL,
  revoked_at DATETIME NULL,
  task_id INT NULL,
  signed_document_id INT NULL,
  is_active TINYINT NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY recording_participant_key (session_recording_id,participant_key),
  KEY recording_participant_client (client_id,legacy_consent_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS session_recording_audio_chunks (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  session_recording_id BIGINT UNSIGNED NOT NULL,
  chunk_key VARCHAR(80) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  recording_revision INT NOT NULL,
  transcript_encrypted LONGTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY recording_audio_chunk (session_recording_id,chunk_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS clinical_audio_cleanup_jobs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  bucket_name VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  object_key VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_attempt_at DATETIME NULL,
  available_at DATETIME NOT NULL,
  UNIQUE KEY clinical_audio_cleanup_object (bucket_name,object_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
