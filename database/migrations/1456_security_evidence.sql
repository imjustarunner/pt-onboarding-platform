-- Apply before deploying the evidence middleware. Do not backfill historical claims.
CREATE TABLE IF NOT EXISTS security_evidence (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  event_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  request_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  occurred_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  phase VARCHAR(32) NOT NULL,
  user_id INT NULL,
  actor_email VARCHAR(255) NULL,
  actor_role VARCHAR(64) NULL,
  session_ref CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
  method VARCHAR(12) NOT NULL,
  route VARCHAR(512) NOT NULL,
  client_ip VARCHAR(45) NULL,
  ip_source VARCHAR(48) NOT NULL,
  peer_ip VARCHAR(45) NULL,
  forwarded_ips JSON NOT NULL,
  user_agent VARCHAR(512) NULL,
  action VARCHAR(64) NOT NULL,
  outcome VARCHAR(32) NOT NULL,
  status_code SMALLINT NULL,
  response_bytes BIGINT UNSIGNED NULL,
  duration_ms INT UNSIGNED NULL,
  details JSON NOT NULL,
  build_id VARCHAR(128) NULL,
  UNIQUE KEY uq_evidence_event (event_id),
  KEY idx_evidence_request (request_id, id),
  KEY idx_evidence_user_time (user_id, occurred_at, id),
  KEY idx_evidence_email_time (actor_email, occurred_at, id),
  KEY idx_evidence_ip_time (client_ip, occurred_at, id),
  KEY idx_evidence_session_time (session_ref, occurred_at, id),
  KEY idx_evidence_time (occurred_at, id),
  KEY idx_evidence_action_time (action, occurred_at, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Independent cutoff also invalidates JWTs not yet seen by session security.
CREATE TABLE IF NOT EXISTS user_auth_revocations (
  user_id INT NOT NULL PRIMARY KEY,
  reject_issued_before BIGINT NOT NULL,
  revoked_at DATETIME(3) NOT NULL,
  revoked_by_user_id INT NOT NULL
) ENGINE=InnoDB;

-- No application code may rewrite history. A database owner can still alter
-- triggers; independent retained cloud logs are required for stronger integrity.
CREATE TRIGGER security_evidence_no_update BEFORE UPDATE ON security_evidence
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Security evidence is append-only';
CREATE TRIGGER security_evidence_no_delete BEFORE DELETE ON security_evidence
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Security evidence is append-only';
