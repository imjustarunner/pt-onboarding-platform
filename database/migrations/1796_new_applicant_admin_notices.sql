-- Future applications only. No backfill or replay of existing applications.
CREATE TABLE IF NOT EXISTS hiring_applicant_admin_notices (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 agency_id INT NOT NULL, candidate_user_id INT NOT NULL, submission_id INT NOT NULL,
 status VARCHAR(24) NOT NULL DEFAULT 'pending', communication_id INT NULL,
 personal_initialized TINYINT(1) NOT NULL DEFAULT 0,
 sender_identity_id INT NULL, recipient_address VARCHAR(254) NULL,
 review_reason VARCHAR(255) NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 UNIQUE KEY applicant_admin_submission(agency_id,submission_id),
 INDEX applicant_admin_pending(status,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Per-recipient personal notices allow the native worker to route only to
-- current hiring reviewers. They are independent of email recipient preferences.
SET @applicant_notice_sql=IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE()
 AND TABLE_NAME='hiring_applicant_admin_notices' AND COLUMN_NAME='personal_initialized')=0,
 'ALTER TABLE hiring_applicant_admin_notices ADD COLUMN personal_initialized TINYINT(1) NOT NULL DEFAULT 0','SELECT 1');
PREPARE applicant_notice_stmt FROM @applicant_notice_sql;
EXECUTE applicant_notice_stmt;
DEALLOCATE PREPARE applicant_notice_stmt;
CREATE TABLE IF NOT EXISTS hiring_applicant_personal_notices (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,agency_id INT NOT NULL,
 candidate_user_id INT NOT NULL,submission_id INT NOT NULL,recipient_user_id INT NOT NULL,
 status VARCHAR(24) NOT NULL DEFAULT 'pending',notification_id INT NULL,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY applicant_personal_submission(agency_id,submission_id,recipient_user_id),
 INDEX applicant_personal_pending(status,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
