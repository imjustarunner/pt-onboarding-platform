-- Staged rollout only. No existing account is enrolled and no message is sent by this migration.
CREATE TABLE IF NOT EXISTS family_portal_migration_enrollments (
 agency_id INT NOT NULL, client_id INT NOT NULL, guardian_user_id INT NOT NULL,
 cohort_label VARCHAR(120) NOT NULL, created_by_user_id INT NOT NULL,
 information_revision CHAR(64) NULL, information_confirmed_at DATETIME NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY (agency_id,client_id,guardian_user_id)
);
CREATE TABLE IF NOT EXISTS family_benefit_email_deliveries (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 agency_id INT NOT NULL, client_id INT NOT NULL, coverage_check_id BIGINT NOT NULL,
 guardian_user_id INT NOT NULL, status VARCHAR(24) NOT NULL DEFAULT 'held',
 benefit_fingerprint CHAR(64) NOT NULL,
 reason VARCHAR(500) NULL, communication_id BIGINT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 UNIQUE KEY benefit_email_once (agency_id,coverage_check_id,guardian_user_id),
 UNIQUE KEY benefit_facts_once (agency_id,client_id,guardian_user_id,benefit_fingerprint)
);
CREATE TABLE IF NOT EXISTS family_portal_migration_deliveries (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 agency_id INT NOT NULL, guardian_user_id INT NOT NULL,
 cohort_label VARCHAR(120) NOT NULL, cohort_fingerprint CHAR(64) NOT NULL,
 status VARCHAR(24) NOT NULL DEFAULT 'pending', reason VARCHAR(500) NULL,
 created_by_user_id INT NOT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 UNIQUE KEY migration_welcome_once (agency_id,guardian_user_id,cohort_fingerprint)
);
