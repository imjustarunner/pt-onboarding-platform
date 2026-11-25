-- Kept outside the shared chart, releases, model inputs and portal document stores.
CREATE TABLE IF NOT EXISTS clinical_confidential_entries (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  client_id INT NOT NULL,
  author_user_id INT NOT NULL,
  clinical_session_id INT NULL,
  clinical_note_id INT NULL,
  draft_id INT NULL,
  request_key CHAR(36) CHARACTER SET ascii NOT NULL,
  body_encrypted MEDIUMTEXT NOT NULL,
  attestation_version SMALLINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_confidential_author_request (author_user_id, request_key),
  KEY ix_confidential_chart (agency_id, client_id, author_user_id, id),
  KEY ix_confidential_draft (agency_id, clinical_session_id, draft_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
