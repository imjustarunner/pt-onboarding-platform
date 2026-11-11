-- Each row reserves one paid search before contacting Stedi. Results and
-- demographics are encrypted; this ledger never automatically retries a POST.
CREATE TABLE IF NOT EXISTS stedi_discovery_budget (
  month_key CHAR(7) NOT NULL PRIMARY KEY,
  reserved_count INT UNSIGNED NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS stedi_insurance_discoveries (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  client_id INT NOT NULL,
  actor_user_id INT NOT NULL,
  request_key VARCHAR(80) NOT NULL,
  identity_fingerprint CHAR(64) NOT NULL,
  service_date DATE NOT NULL,
  month_key CHAR(7) NOT NULL,
  status VARCHAR(24) NOT NULL,
  discovery_id VARCHAR(128) NULL,
  request_encrypted LONGTEXT NOT NULL,
  response_encrypted LONGTEXT NULL,
  review_encrypted LONGTEXT NULL,
  review_required TINYINT NOT NULL DEFAULT 0,
  reviewed_by_user_id INT NULL,
  poll_started_at DATETIME(6) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_stedi_request (agency_id,client_id,request_key),
  KEY ix_stedi_client (agency_id,client_id,id),
  KEY ix_stedi_cooldown (agency_id,client_id,created_at),
  KEY ix_stedi_review (agency_id,client_id,review_required)
);
