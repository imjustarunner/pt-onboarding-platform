-- Stable, shareable references. These identify records and never grant access.
CREATE TABLE IF NOT EXISTS schedule_record_references (
  record_type VARCHAR(32) NOT NULL,
  record_id BIGINT UNSIGNED NOT NULL,
  reference VARCHAR(24) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (record_type, record_id),
  UNIQUE KEY schedule_reference_unique (reference)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
