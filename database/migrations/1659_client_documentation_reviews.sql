-- Receipt and provider assignment do not attest to documentation readiness.
-- Reviews are append-only, scoped to an agency/client and service stage.
CREATE TABLE IF NOT EXISTS client_documentation_reviews (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  client_id INT NOT NULL,
  review_scope ENUM('screening','treatment') NOT NULL,
  status ENUM('verified','incomplete') NOT NULL,
  effective_from DATE NOT NULL,
  effective_through DATE NULL,
  source_hash CHAR(64) NOT NULL,
  evidence_encrypted MEDIUMTEXT NOT NULL,
  created_by_user_id INT NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  KEY idx_client_documentation_latest (agency_id,client_id,review_scope,id)
);
