CREATE TABLE IF NOT EXISTS provider_account_conversions (
 id CHAR(36) PRIMARY KEY,
 agency_id INT NOT NULL,
 provider_user_id INT NOT NULL,
 target_email VARCHAR(254) NOT NULL,
 original_workspace_user_id VARCHAR(128) NOT NULL,
 original_workspace_email VARCHAR(254) NOT NULL,
 recovery_email VARCHAR(254) NOT NULL,
 group_id VARCHAR(128) NULL,
 state VARCHAR(32) NOT NULL DEFAULT 'captured',
 revision INT NOT NULL DEFAULT 1,
 password_prepared_at DATETIME NULL,
 activated_at DATETIME NULL,
 requested_by_user_id INT NOT NULL,
 last_error_code VARCHAR(80) NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 UNIQUE KEY provider_conversion_agency_user (agency_id,provider_user_id)
);
CREATE TABLE IF NOT EXISTS provider_account_conversion_events (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 conversion_id CHAR(36) NOT NULL,
 agency_id INT NOT NULL,
 provider_user_id INT NOT NULL,
 initiated_by_user_id INT NOT NULL,
 event_type VARCHAR(80) NOT NULL,
 automation_principal VARCHAR(254) NULL,
 delegation_subject VARCHAR(254) NULL,
 evidence_json JSON NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 INDEX provider_conversion_event (conversion_id,id)
);
