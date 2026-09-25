-- Clinical case access/acknowledgement is separate from note cosign and claims.
-- Store references/digests only; clinical narratives stay in the clinical database.
CREATE TABLE IF NOT EXISTS supervision_case_review_events (
 id BIGINT AUTO_INCREMENT PRIMARY KEY,
 agency_id INT NOT NULL,
 provider_user_id INT NOT NULL,
 reviewer_user_id INT NOT NULL,
 client_id INT NOT NULL,
 event_type ENUM('view','acknowledged') NOT NULL,
 content_hash CHAR(64) NOT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 INDEX idx_case_review (agency_id,provider_user_id,client_id,reviewer_user_id,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
