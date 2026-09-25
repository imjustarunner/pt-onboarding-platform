CREATE TABLE IF NOT EXISTS clinical_claim_ai_reviews (
 id BIGINT AUTO_INCREMENT PRIMARY KEY,
 agency_id INT NOT NULL,
 clinical_claim_id BIGINT NOT NULL,
 source_hash CHAR(64) NOT NULL,
 model_name VARCHAR(100) NOT NULL,
 review_version VARCHAR(40) NOT NULL,
 result_encrypted MEDIUMTEXT NOT NULL,
 requested_by_user_id INT NOT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 INDEX idx_claim_ai_review (agency_id, clinical_claim_id, source_hash, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
