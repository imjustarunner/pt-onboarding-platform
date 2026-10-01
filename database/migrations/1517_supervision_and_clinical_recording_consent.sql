/* Consent is an executed, versioned document; choosing recording never implies consent. */
CREATE TABLE IF NOT EXISTS supervision_agreements (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  assignment_id INT NOT NULL,
  agency_id INT NOT NULL,
  supervisor_user_id INT NOT NULL,
  supervisee_user_id INT NOT NULL,
  version INT NOT NULL DEFAULT 1,
  document_json JSON NOT NULL,
  document_hash CHAR(64) NOT NULL,
  supervisor_signature_json JSON NULL,
  supervisee_signature_json JSON NULL,
  supervisor_signed_at DATETIME NULL,
  supervisee_signed_at DATETIME NULL,
  signed_pdf_path VARCHAR(1024) NULL,
  revoked_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY supervision_agreement_assignment_version (assignment_id,supervisor_user_id,supervisee_user_id,version),
  KEY supervision_agreement_parties (agency_id,supervisee_user_id,supervisor_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE session_recording_consents
  ADD COLUMN document_json JSON NULL,
  ADD COLUMN document_hash CHAR(64) NULL,
  ADD COLUMN signature_json JSON NULL,
  ADD COLUMN signed_pdf_path VARCHAR(1024) NULL,
  ADD COLUMN revoked_at DATETIME NULL;

CREATE TABLE IF NOT EXISTS meeting_transcription_controls (
  meeting_type ENUM('supervision','counseling') NOT NULL,
  meeting_id BIGINT UNSIGNED NOT NULL,
  requested TINYINT NOT NULL DEFAULT 0,
  paused TINYINT NOT NULL DEFAULT 1,
  stopped TINYINT NOT NULL DEFAULT 0,
  revision INT NOT NULL DEFAULT 0,
  changed_by_user_id INT NULL,
  changed_by_role VARCHAR(32) NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (meeting_type,meeting_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS meeting_transcription_chunks (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  meeting_type ENUM('supervision','counseling') NOT NULL,
  meeting_id BIGINT UNSIGNED NOT NULL,
  chunk_key VARCHAR(80) NOT NULL,
  speaker_key VARCHAR(80) NOT NULL,
  transcript_encrypted LONGTEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY meeting_transcription_chunk (meeting_type,meeting_id,speaker_key,chunk_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS supervision_manual_entries (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  session_id INT NOT NULL,
  agency_id INT NOT NULL,
  supervisor_user_id INT NOT NULL,
  supervisee_user_id INT NOT NULL,
  created_by_user_id INT NOT NULL,
  reason TEXT NOT NULL,
  approved_at DATETIME NULL,
  approved_by_user_id INT NULL,
  modality VARCHAR(32) NOT NULL,
  request_key VARCHAR(80) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY supervision_manual_request (agency_id,created_by_user_id,request_key),
  UNIQUE KEY supervision_manual_session (session_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE counseling_sessions
  ADD COLUMN recording_requested TINYINT NOT NULL DEFAULT 0,
  ADD COLUMN recording_consent_id BIGINT UNSIGNED NULL,
  ADD COLUMN recording_note_draft_id INT NULL;

/* An invited client need not have an app account. The client identity is bound */
/* to the invitation and appointment; no synthetic staff identity is substituted. */
ALTER TABLE counseling_session_chat MODIFY COLUMN sender_user_id INT NULL;
ALTER TABLE counseling_session_notes MODIFY COLUMN author_user_id INT NULL;

ALTER TABLE meeting_transcription_controls ADD COLUMN finishing TINYINT NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS meeting_transcription_publishers (
  meeting_type ENUM('supervision','counseling') NOT NULL,
  meeting_id BIGINT UNSIGNED NOT NULL,
  speaker_key VARCHAR(80) NOT NULL,
  last_seen_at DATETIME NOT NULL,
  drained TINYINT NOT NULL DEFAULT 0,
  PRIMARY KEY (meeting_type,meeting_id,speaker_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
