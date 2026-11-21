CREATE TABLE IF NOT EXISTS codex_assistant_mail_deliveries (
  request_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  agency_id INT NOT NULL,
  sender_identity_id INT NOT NULL,
  automation_subject VARCHAR(80) CHARACTER SET ascii NOT NULL,
  payload_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  status ENUM('sending','sent','held','delivery_unknown') NOT NULL,
  communication_id BIGINT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY idx_codex_assistant_mail_agency_time (agency_id, created_at)
) ENGINE=InnoDB;
