CREATE TABLE IF NOT EXISTS transition_meeting_sequences (
 sequence_id VARCHAR(100) PRIMARY KEY, agency_id INT NOT NULL,
 revision INT NOT NULL DEFAULT 0, status VARCHAR(24) NOT NULL DEFAULT 'draft',
 payload_json JSON NOT NULL, automation_subject VARCHAR(254) NOT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
);
CREATE TABLE IF NOT EXISTS transition_meeting_sequence_audit (
 id BIGINT AUTO_INCREMENT PRIMARY KEY, sequence_id VARCHAR(100) NOT NULL,
 revision INT NOT NULL, automation_subject VARCHAR(254) NOT NULL,
 actor_type VARCHAR(24) NOT NULL DEFAULT 'automation', actor_user_id INT NULL,
 payload_json JSON NOT NULL, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 UNIQUE KEY transition_sequence_revision(sequence_id,revision)
);
CREATE TABLE IF NOT EXISTS transition_meeting_sequence_events (
 sequence_id VARCHAR(100) NOT NULL, meeting_number INT NOT NULL, event_id INT NOT NULL,
 PRIMARY KEY(sequence_id,meeting_number), UNIQUE KEY transition_sequence_event(event_id)
);
CREATE TABLE IF NOT EXISTS transition_meeting_claim_links (
 sequence_id VARCHAR(100) NOT NULL, event_id INT NOT NULL,user_id INT NOT NULL,claim_id INT NOT NULL,
 rate_amount DECIMAL(8,2) NOT NULL,attendance_seconds INT NOT NULL,
 PRIMARY KEY(event_id,user_id),UNIQUE KEY transition_sequence_claim(claim_id)
);
