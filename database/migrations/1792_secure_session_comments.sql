-- Immutable, exact-audience clinical communications. Bodies are AES-256-GCM
-- ciphertext; no plaintext copy is written to chat, notifications or audit.
CREATE TABLE IF NOT EXISTS secure_session_comments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  appointment_id INT NOT NULL,
  client_id INT NOT NULL,
  author_user_id INT NOT NULL,
  request_id VARCHAR(80) NOT NULL,
  request_hash CHAR(64) NOT NULL,
  body_ciphertext MEDIUMTEXT NOT NULL,
  body_iv VARCHAR(32) NOT NULL,
  body_auth_tag VARCHAR(32) NOT NULL,
  encryption_key_id VARCHAR(80) NOT NULL,
  revision INT UNSIGNED NOT NULL DEFAULT 1,
  revision_event_id BIGINT UNSIGNED NOT NULL DEFAULT 0,
  edited_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_session_comment_request (author_user_id, request_id),
  UNIQUE KEY uq_session_comment_author (appointment_id,client_id,author_user_id),
  KEY ix_session_comment_client (client_id, id),
  KEY ix_session_comment_appointment (appointment_id, client_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS secure_session_comment_recipients (
  comment_id BIGINT UNSIGNED NOT NULL,
  revision INT UNSIGNED NOT NULL DEFAULT 1,
  user_id INT NOT NULL,
  read_at DATETIME(3) NULL,
  PRIMARY KEY (comment_id, revision, user_id),
  KEY ix_session_comment_recipient (user_id, read_at, comment_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Revision ciphertext and its exact original audience are retained for audit;
-- the public API exposes only the current version of the person's one comment.
CREATE TABLE IF NOT EXISTS secure_session_comment_revisions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  comment_id BIGINT UNSIGNED NOT NULL,
  revision INT UNSIGNED NOT NULL,
  author_user_id INT NOT NULL,
  request_id VARCHAR(80) NOT NULL,
  request_hash CHAR(64) NOT NULL,
  body_ciphertext MEDIUMTEXT NOT NULL,
  body_iv VARCHAR(32) NOT NULL,
  body_auth_tag VARCHAR(32) NOT NULL,
  encryption_key_id VARCHAR(80) NOT NULL,
  audience_json JSON NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY(comment_id,revision),
  UNIQUE KEY uq_session_comment_revision_event(id),
  UNIQUE KEY uq_session_comment_revision_request(author_user_id,request_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS secure_session_comment_audit (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NULL,
  appointment_id INT NULL,
  client_id INT NULL,
  comment_id BIGINT UNSIGNED NULL,
  actor_user_id INT NOT NULL,
  action VARCHAR(64) NOT NULL,
  ip_hash CHAR(64) NULL,
  revision INT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY ix_session_comment_audit (agency_id, appointment_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS secure_session_comment_attention (
  user_id INT NOT NULL,
  day_key DATE NOT NULL,
  time_zone VARCHAR(80) NOT NULL,
  action VARCHAR(24) NOT NULL,
  watermark BIGINT UNSIGNED NOT NULL DEFAULT 0,
  snoozed_until DATETIME(3) NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (user_id, day_key, time_zone)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- A sending/unknown operation is never automatically retried. The normal mail
-- pipeline owns any queued communication; delivery does not assert inbox receipt.
CREATE TABLE IF NOT EXISTS secure_session_comment_deliveries (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  recipient_user_id INT NOT NULL,
  comment_id BIGINT UNSIGNED NULL,
  revision INT UNSIGNED NULL,
  kind VARCHAR(24) NOT NULL,
  dedupe_key VARCHAR(180) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'pending',
  reason VARCHAR(80) NULL,
  notification_id INT NULL,
  communication_id INT NULL,
  time_zone VARCHAR(80) NULL,
  day_key DATE NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  attempted_at DATETIME(3) NULL,
  transport_claimed_at DATETIME(3) NULL,
  UNIQUE KEY uq_session_comment_delivery (dedupe_key),
  KEY ix_session_comment_delivery_pending (status, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
