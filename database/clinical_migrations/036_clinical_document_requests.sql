CREATE TABLE IF NOT EXISTS clinical_document_requests (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  anchor_client_id INT NOT NULL,
  issued_by_user_id INT NOT NULL,
  recipient_key VARCHAR(60) CHARACTER SET ascii NOT NULL,
  request_key CHAR(36) CHARACTER SET ascii NOT NULL,
  selection_hash CHAR(64) CHARACTER SET ascii NOT NULL,
  revoked_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_clinical_document_request (issued_by_user_id, anchor_client_id, request_key, recipient_key),
  KEY ix_clinical_document_request_chart (agency_id, anchor_client_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS clinical_document_request_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  request_id BIGINT UNSIGNED NOT NULL,
  client_id INT NOT NULL,
  source_kind ENUM('form','treatment_plan','file') NOT NULL,
  source_id BIGINT UNSIGNED NOT NULL,
  signer_id BIGINT UNSIGNED NULL,
  source_version VARCHAR(128) CHARACTER SET ascii NOT NULL,
  action ENUM('complete','sign','view') NOT NULL,
  completed_version INT NULL,
  completed_at DATETIME NULL,
  evidence_encrypted MEDIUMTEXT NULL,
  snapshot_encrypted MEDIUMTEXT NULL,
  completed_signer_id BIGINT UNSIGNED NULL,
  FOREIGN KEY (request_id) REFERENCES clinical_document_requests(id),
  KEY ix_clinical_document_request_item_signer (signer_id),
  KEY ix_clinical_document_request_item_chart (client_id, request_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS clinical_document_request_deliveries (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  request_id BIGINT UNSIGNED NOT NULL,
  channel ENUM('email','sms','portal') NOT NULL,
  destination_hash CHAR(64) CHARACTER SET ascii NULL,
  token_hash CHAR(64) CHARACTER SET ascii NULL,
  session_hash CHAR(64) CHARACTER SET ascii NULL,
  expires_at DATETIME NULL,
  session_expires_at DATETIME NULL,
  opened_at DATETIME NULL,
  revoked_at DATETIME NULL,
  state ENUM('sending','sent','queued','failed','unconfirmed') NOT NULL,
  provider_reference VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (request_id) REFERENCES clinical_document_requests(id),
  UNIQUE KEY uq_clinical_document_request_token (token_hash),
  UNIQUE KEY uq_clinical_document_request_session (session_hash),
  KEY ix_clinical_document_request_channel (request_id, channel)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS clinical_document_request_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  request_id BIGINT UNSIGNED NOT NULL,
  item_id BIGINT UNSIGNED NULL,
  delivery_id BIGINT UNSIGNED NULL,
  actor_user_id INT NULL,
  action VARCHAR(40) CHARACTER SET ascii NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (request_id) REFERENCES clinical_document_requests(id),
  KEY ix_clinical_document_request_event (request_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS clinical_release_recipient_links (
  plan_id BIGINT UNSIGNED NOT NULL,
  version INT NOT NULL,
  affiliation_id BIGINT UNSIGNED NULL,
  state ENUM('pending','linked','needs_review','not_applicable') NOT NULL DEFAULT 'pending',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (plan_id, version),
  FOREIGN KEY (plan_id, version) REFERENCES clinical_form_versions(plan_id, version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE clinical_form_versions MODIFY COLUMN created_by_user_id INT NULL;
ALTER TABLE clinical_form_signers ADD COLUMN delivery_managed TINYINT NOT NULL DEFAULT 0;
ALTER TABLE clinical_form_signers MODIFY COLUMN signing_method ENUM('portal','in_person','staff','direct_link') NULL;

ALTER TABLE client_outcome_measure_responses MODIFY COLUMN recorded_by_user_id INT NULL;
