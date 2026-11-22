-- Versioned tutoring materials, exact-session guest entry and tutor-reviewed progression.
CREATE TABLE IF NOT EXISTS tutoring_guest_grants (
 id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 appointment_id BIGINT NOT NULL, agency_id INT NOT NULL, client_id INT NOT NULL,
 recipient_user_id INT NOT NULL, booking_hash CHAR(64) NOT NULL,
 token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 token_envelope LONGTEXT NOT NULL, revoked_at DATETIME NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY uq_tutoring_guest_token(token_hash),
 KEY idx_tutoring_guest_booking(appointment_id,recipient_user_id,booking_hash)
);
CREATE TABLE IF NOT EXISTS tutoring_guest_sessions (
 id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 grant_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 proof_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, last_checked_at DATETIME NULL,
 revoked_at DATETIME NULL, KEY idx_tutoring_guest_session_grant(grant_id)
);
CREATE TABLE IF NOT EXISTS tutoring_material_versions (
 id BIGINT AUTO_INCREMENT PRIMARY KEY, session_material_id INT NOT NULL,
 session_id INT NOT NULL, agency_id INT NOT NULL, client_id INT NOT NULL,
 version_number INT NOT NULL, status ENUM('draft','approved') NOT NULL DEFAULT 'draft',
 definition_envelope LONGTEXT NOT NULL, source_hash CHAR(64) NOT NULL, source_storage_path VARCHAR(1024) NOT NULL,
 created_by_user_id INT NOT NULL, approved_by_user_id INT NULL, approved_at DATETIME NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY uq_tutoring_material_version(session_material_id,version_number),
 KEY idx_tutoring_material_session(session_id,session_material_id,status)
);
CREATE TABLE IF NOT EXISTS tutoring_material_attempts (
 id BIGINT AUTO_INCREMENT PRIMARY KEY, material_version_id BIGINT NOT NULL,
 session_id INT NOT NULL, agency_id INT NOT NULL, client_id INT NOT NULL,
 actor VARCHAR(100) NOT NULL, request_id CHAR(36) NOT NULL,
 revision INT NOT NULL DEFAULT 1, responses_envelope LONGTEXT NOT NULL, status ENUM('draft','submitted','reviewed') NOT NULL,
 review_envelope LONGTEXT NULL, reviewed_by_user_id INT NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, reviewed_at DATETIME NULL,
 UNIQUE KEY uq_tutoring_material_attempt(material_version_id,client_id,actor,request_id),
 KEY idx_tutoring_material_attempt_session(session_id,client_id)
);
CREATE TABLE IF NOT EXISTS tutoring_material_shares (
 id BIGINT AUTO_INCREMENT PRIMARY KEY, session_id INT NOT NULL,
 material_version_id BIGINT NOT NULL, shared_by_user_id INT NOT NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, revoked_at DATETIME NULL,
 UNIQUE KEY uq_tutoring_material_share(session_id,material_version_id)
);
CREATE TABLE IF NOT EXISTS tutoring_resource_library (
 id BIGINT AUTO_INCREMENT PRIMARY KEY, agency_id INT NOT NULL, owner_user_id INT NOT NULL,
 source_client_id INT NULL, status ENUM('draft','published','archived') NOT NULL DEFAULT 'draft',
 title VARCHAR(255) NOT NULL, subject_label VARCHAR(128) NULL, grade_label VARCHAR(64) NULL,
 resource_envelope LONGTEXT NOT NULL, published_by_user_id INT NULL, published_at DATETIME NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 KEY idx_tutoring_library(agency_id,status,owner_user_id)
);
CREATE TABLE IF NOT EXISTS tutoring_progress_reviews (
 id BIGINT AUTO_INCREMENT PRIMARY KEY, agency_id INT NOT NULL, client_id INT NOT NULL,
 student_subject_id INT NOT NULL, plan_id INT NOT NULL, goal_id INT NULL,
 evidence_hash CHAR(64) NOT NULL, recommendation_envelope LONGTEXT NOT NULL,
 status ENUM('suggested','approved','dismissed') NOT NULL DEFAULT 'suggested',
 decided_by_user_id INT NULL, decided_at DATETIME NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY uq_tutoring_progress_review(student_subject_id,evidence_hash),
 KEY idx_tutoring_progress_status(agency_id,client_id,status)
);
UPDATE agencies SET feature_flags=JSON_SET(COALESCE(feature_flags,JSON_OBJECT()),'$.tutoringSessionHubV2',CAST('true' AS JSON))
 WHERE id IN (453,454) AND slug IN ('nlu-qa-demo','nlu-qa-learning')
 AND JSON_UNQUOTE(JSON_EXTRACT(feature_flags,'$.qaSandbox.syntheticOnly'))='true';
