-- Technical metadata only; unknown field names are encrypted because object
-- keys may contain identifiers. Never store response values in this inventory.
CREATE TABLE IF NOT EXISTS claimmd_data_gaps (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL DEFAULT 0,
  payer_id VARCHAR(32) NOT NULL DEFAULT '',
  issue_key CHAR(64) NOT NULL,
  endpoint VARCHAR(80) NOT NULL,
  issue_kind VARCHAR(80) NOT NULL,
  public_path VARCHAR(512) NOT NULL,
  path_encrypted LONGTEXT NOT NULL,
  first_seen_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  last_seen_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  occurrences BIGINT UNSIGNED NOT NULL DEFAULT 1,
  notification_status VARCHAR(24) NOT NULL DEFAULT 'pending',
  digest_key CHAR(64) NULL,
  communication_id BIGINT NULL,
  UNIQUE KEY uq_claimmd_data_gap (issue_key),
  KEY ix_claimmd_data_gap_pending (notification_status, id)
);

CREATE TABLE IF NOT EXISTS claimmd_data_monitor_state (
  id TINYINT NOT NULL PRIMARY KEY,
  catalog_checked_at DATETIME NULL,
  digest_attempted_at DATETIME NULL,
  digest_status VARCHAR(24) NULL,
  notification_id BIGINT NULL
);
INSERT IGNORE INTO claimmd_data_monitor_state (id) VALUES (1);
