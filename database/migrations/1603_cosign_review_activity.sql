CREATE TABLE IF NOT EXISTS cosign_review_activity (
 id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
 agency_id INT NOT NULL,
 supervisor_user_id INT NOT NULL,
 provider_user_id INT NOT NULL,
 note_id BIGINT NOT NULL,
 content_hash VARCHAR(64) NOT NULL,
 session_key VARCHAR(64) NOT NULL,
 started_at DATETIME(3) NOT NULL,
 last_heartbeat_at DATETIME(3) NOT NULL,
 ended_at DATETIME(3) NULL,
 active_seconds DECIMAL(12,3) NOT NULL DEFAULT 0,
 is_active TINYINT(1) NOT NULL DEFAULT 0,
 claim_date DATE NOT NULL,
 payroll_time_claim_id INT NULL,
 UNIQUE KEY uq_cosign_activity_request (supervisor_user_id,session_key),
 INDEX idx_cosign_activity_owner (supervisor_user_id,ended_at,last_heartbeat_at),
 INDEX idx_cosign_activity_provider (agency_id,provider_user_id,started_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS cosign_review_activity_intervals (
 id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
 activity_id BIGINT NOT NULL,
 supervisor_user_id INT NOT NULL,
 start_at DATETIME(3) NOT NULL,
 end_at DATETIME(3) NOT NULL,
 INDEX idx_cosign_interval_overlap (supervisor_user_id,start_at,end_at),
 INDEX idx_cosign_interval_activity (activity_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
