CREATE TABLE IF NOT EXISTS claim_adjudication_evidence (
 id CHAR(36) PRIMARY KEY,
 agency_id INT NOT NULL,
 client_id INT NOT NULL,
 primary_claim_id INT NOT NULL,
 storage_key VARCHAR(512) NOT NULL,
 content_sha256 CHAR(64) NOT NULL,
 metadata_encrypted LONGTEXT NOT NULL,
 created_by_user_id INT NOT NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 INDEX idx_primary_adjudication_evidence (agency_id, primary_claim_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
