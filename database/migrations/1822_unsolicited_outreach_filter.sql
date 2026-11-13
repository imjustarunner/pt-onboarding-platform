-- One durable notice per sender/organization; no support ticket or message body.
CREATE TABLE IF NOT EXISTS unsolicited_outreach_notices (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  sender_email VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  category VARCHAR(32) NOT NULL,
  source VARCHAR(32) NOT NULL,
  status ENUM('queued','sending','sent','skipped','needs_review') NOT NULL DEFAULT 'queued',
  suppression_count INT UNSIGNED NOT NULL DEFAULT 1,
  communication_id INT NULL,
  ready_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  attempted_at DATETIME NULL,
  sent_at DATETIME NULL,
  last_error VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_unsolicited_sender (agency_id,sender_email),
  KEY idx_unsolicited_ready (status,ready_at),
  CONSTRAINT fk_unsolicited_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
