-- Preserve existing office URLs while allowing one independent office per tenant.
ALTER TABLE provider_my_rooms DROP INDEX uq_provider_my_rooms_user,
 ADD UNIQUE KEY uq_provider_my_rooms_user_agency (user_id,agency_id);
ALTER TABLE private_virtual_office_visits
 ADD COLUMN ip_address VARCHAR(45) NULL,
 ADD COLUMN ended_at DATETIME NULL,
 ADD COLUMN duration_seconds INT NULL;
-- Append-only shared content; payloads are encrypted by the application.
CREATE TABLE IF NOT EXISTS therapy_session_artifacts (
 id BIGINT AUTO_INCREMENT PRIMARY KEY,
 session_kind ENUM('office','counseling') NOT NULL,
 session_id BIGINT NOT NULL,
 generation INT NOT NULL DEFAULT 0,
 agency_id INT NOT NULL,
 actor VARCHAR(100) NOT NULL,
 actor_role VARCHAR(16) NOT NULL,
 artifact_type VARCHAR(32) NOT NULL,
 payload_envelope MEDIUMTEXT NOT NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 INDEX session_artifacts (session_kind,session_id,generation,id)
);
CREATE TABLE IF NOT EXISTS counseling_session_visits (
 id BIGINT AUTO_INCREMENT PRIMARY KEY,session_id INT NOT NULL,actor VARCHAR(100) NOT NULL,
 ip_address VARCHAR(45) NULL,status ENUM('waiting','admitted','ended') NOT NULL DEFAULT 'waiting',
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 admitted_at DATETIME NULL,ended_at DATETIME NULL,duration_seconds INT NULL,
 INDEX session_visits (session_id,actor,status)
);
