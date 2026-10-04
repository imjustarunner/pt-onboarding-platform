-- Each office generation is one provider-ended encounter; media is never reused.
CREATE TABLE clinical_video_sessions (
 media_id VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 session_kind ENUM('office','counseling') NOT NULL,
 session_id BIGINT NOT NULL, generation INT NOT NULL DEFAULT 0, agency_id INT NOT NULL,
 state ENUM('active','ending','ended') NOT NULL DEFAULT 'active',
 started_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 end_requested_at DATETIME(3) NULL, ended_at DATETIME(3) NULL, empty_confirmed_at DATETIME(3) NULL,
 legal_hold BOOLEAN NOT NULL DEFAULT FALSE,
 UNIQUE KEY encounter (session_kind,session_id,generation),
 INDEX closure (state,end_requested_at)
);
CREATE TABLE clinical_video_grants (
 id CHAR(36) CHARACTER SET ascii PRIMARY KEY,
 media_id VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 actor VARCHAR(100) NOT NULL, participant_role VARCHAR(16) NOT NULL,
 visit_id BIGINT NULL, expires_at DATETIME(3) NOT NULL, revoked_at DATETIME(3) NULL,
 INDEX media_grants (media_id,expires_at),
 FOREIGN KEY (media_id) REFERENCES clinical_video_sessions(media_id)
);
CREATE TABLE clinical_video_connections (
 media_id VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 connection_id VARCHAR(100) CHARACTER SET ascii NOT NULL,
 grant_id CHAR(36) CHARACTER SET ascii NULL,
 connected_at DATETIME(3) NOT NULL, disconnected_at DATETIME(3) NULL,
 disconnect_requested BOOLEAN NOT NULL DEFAULT FALSE,
 PRIMARY KEY (media_id,connection_id),
 FOREIGN KEY (media_id) REFERENCES clinical_video_sessions(media_id),
 INDEX grant_connections (grant_id)
);
-- No automatic clinical-record destruction without an explicitly configured policy.
CREATE TABLE clinical_session_retention (
 agency_id INT PRIMARY KEY, artifact_days INT NULL,
 updated_by_user_id INT NOT NULL, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE private_virtual_office_visits ADD COLUMN ip_source VARCHAR(32) NOT NULL DEFAULT 'unverified_proxy';
ALTER TABLE counseling_session_visits ADD COLUMN ip_source VARCHAR(32) NOT NULL DEFAULT 'unverified_proxy';
