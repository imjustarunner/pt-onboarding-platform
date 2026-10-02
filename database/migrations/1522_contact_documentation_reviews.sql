-- Immutable revisions retain the purpose and reviewed message boundary for each author/thread.
CREATE TABLE IF NOT EXISTS contact_documentation_reviews (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  source_type VARCHAR(16) NOT NULL,
  source_id INT NOT NULL,
  revision INT NOT NULL,
  reviewed_through_id BIGINT UNSIGNED NOT NULL DEFAULT 0,
  purpose_enc MEDIUMTEXT NOT NULL,
  completed_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY contact_review_revision (user_id, source_type, source_id, revision),
  KEY contact_review_source (source_type, source_id, id)
);

CREATE TABLE IF NOT EXISTS communication_filing_checks (
  message_id INT NOT NULL PRIMARY KEY,
  checked_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
