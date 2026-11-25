-- Internal diagnostic support, separate from releasable note content and exports.
-- Revisions are append-only and attributed to the actual authenticated actor.
CREATE TABLE IF NOT EXISTS clinical_diagnostic_criteria_reviews (
 id BIGINT AUTO_INCREMENT PRIMARY KEY,
 agency_id INT NOT NULL,
 client_id INT NOT NULL,
 clinical_session_id BIGINT NULL,
 draft_id BIGINT NOT NULL,
 author_user_id INT NOT NULL,
 icd10_code VARCHAR(16) NOT NULL,
 parent_review_id BIGINT NULL,
 result_encrypted LONGTEXT NOT NULL,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 INDEX idx_diagnostic_criteria_client (agency_id,client_id,id),
 INDEX idx_diagnostic_criteria_draft (agency_id,draft_id,author_user_id,id),
 INDEX idx_diagnostic_criteria_session (agency_id,clinical_session_id,author_user_id,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
