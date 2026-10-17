CREATE TABLE IF NOT EXISTS clinical_form_records (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 agency_id INT NOT NULL, client_id INT NULL, created_by_user_id INT NOT NULL,
 document_key VARCHAR(64) NOT NULL DEFAULT 'safety-plan',
 current_version INT NOT NULL DEFAULT 1,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 INDEX idx_safety_client (agency_id, client_id), INDEX idx_safety_author (agency_id, created_by_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS clinical_form_versions (
 plan_id BIGINT UNSIGNED NOT NULL, version INT NOT NULL,
 payload_encrypted MEDIUMTEXT NOT NULL, content_hash CHAR(64) NOT NULL,
 created_by_user_id INT NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(plan_id, version),
 FOREIGN KEY(plan_id) REFERENCES clinical_form_records(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS clinical_form_signers (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 plan_id BIGINT UNSIGNED NOT NULL, version INT NOT NULL,
 signer_kind ENUM('client','guardian','clinician') NOT NULL,
 recipient_user_id INT NULL, details_encrypted TEXT NOT NULL,
 portal_shared_at DATETIME NULL, revoked_at DATETIME NULL,
 signature_encrypted MEDIUMTEXT NULL, signed_at DATETIME NULL,
 actor_user_id INT NULL, signing_method ENUM('portal','in_person','staff') NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 INDEX idx_safety_recipient(recipient_user_id,plan_id),
 FOREIGN KEY(plan_id,version) REFERENCES clinical_form_versions(plan_id,version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS clinical_form_events (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 plan_id BIGINT UNSIGNED NOT NULL, version INT NOT NULL, actor_user_id INT NOT NULL,
 action VARCHAR(40) NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 INDEX idx_safety_events(plan_id,version), FOREIGN KEY(plan_id) REFERENCES clinical_form_records(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS clinical_form_notification_batches (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 agency_id INT NOT NULL, recipient_user_id INT NOT NULL, batch_key BIGINT NOT NULL,
 available_at DATETIME NOT NULL,
 email_state ENUM('pending','sending','sent','skipped','review') NOT NULL DEFAULT 'pending',
 sms_state ENUM('pending','sending','sent','skipped','review') NOT NULL DEFAULT 'pending',
 email_provider_ref VARCHAR(255) NULL, sms_provider_ref VARCHAR(255) NULL,
 updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY uq_clinical_form_notification_batch (agency_id,recipient_user_id),
 INDEX idx_clinical_form_notification_due (available_at,email_state,sms_state)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
