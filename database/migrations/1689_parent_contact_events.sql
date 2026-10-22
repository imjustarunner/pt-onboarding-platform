CREATE TABLE IF NOT EXISTS client_parent_contact_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  source_type VARCHAR(16) NOT NULL,
  source_id BIGINT UNSIGNED NOT NULL,
  client_id INT NOT NULL,
  agency_id INT NOT NULL,
  guardian_user_id INT NOT NULL,
  author_user_id INT NOT NULL,
  direction VARCHAR(16) NOT NULL,
  successful TINYINT(1) NOT NULL DEFAULT 0,
  occurred_at DATETIME NOT NULL,
  note_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_parent_contact_source (source_type, source_id, client_id),
  KEY ix_parent_contact_client (client_id, occurred_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS parent_contact_sync_checks (
  source_type VARCHAR(16) NOT NULL,
  source_id BIGINT UNSIGNED NOT NULL,
  checked_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (source_type, source_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
