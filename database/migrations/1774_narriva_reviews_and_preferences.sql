-- Server-owned, exact-content Narriva reviews. Clinical findings remain encrypted.
CREATE TABLE IF NOT EXISTS narriva_reviews (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 agency_id INT NOT NULL,
 actor_user_id INT NOT NULL,
 draft_id INT NULL,
 clinical_note_id INT NULL,
 clinical_session_id INT NULL,
 risk_assessment_required TINYINT(1) NOT NULL DEFAULT 0,
 source_hash CHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
 rules_version VARCHAR(80) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
 status VARCHAR(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
 result_encrypted LONGTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
 completed_at DATETIME(3) NULL,
 INDEX narriva_draft (agency_id,draft_id,id),
 INDEX narriva_note (agency_id,clinical_note_id,id),
 INDEX narriva_session_risk (agency_id,clinical_session_id,risk_assessment_required)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS narriva_writer_preferences (
 user_id INT NOT NULL,
 agency_id INT NOT NULL,
 default_mode VARCHAR(24) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'manual',
 updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 PRIMARY KEY (user_id,agency_id)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
