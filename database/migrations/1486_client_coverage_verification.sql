-- Eligibility responses and COB decisions are separate, dated evidence.
CREATE TABLE client_coverage_checks (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 agency_id INT NOT NULL, client_id INT NOT NULL,
 policy_slot ENUM('primary','secondary') NOT NULL,
 service_date DATE NOT NULL, insurance_fingerprint CHAR(64) NOT NULL,
 request_key VARCHAR(100) NOT NULL,
 status ENUM('pending','returned','error') NOT NULL DEFAULT 'pending',
 evidence_encrypted MEDIUMTEXT NULL,
 completed_at DATETIME(6) NULL,
 created_by_user_id INT NOT NULL,
 created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 UNIQUE KEY uq_coverage_request (agency_id,client_id,request_key),
 INDEX idx_coverage_date (agency_id,client_id,service_date,id),
 INDEX idx_coverage_latest (agency_id,client_id,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE client_coverage_reviews (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 agency_id INT NOT NULL, client_id INT NOT NULL, service_date DATE NOT NULL,
 insurance_fingerprint CHAR(64) NOT NULL,
 status ENUM('verified','unresolved','inactive') NOT NULL,
 through_check_id BIGINT UNSIGNED NOT NULL DEFAULT 0,
 evidence_encrypted MEDIUMTEXT NOT NULL,
 created_by_user_id INT NOT NULL,
 created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 INDEX idx_coverage_review (agency_id,client_id,service_date,id),
 INDEX idx_coverage_review_latest (agency_id,client_id,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
