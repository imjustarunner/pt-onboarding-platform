-- Phone relay is explicit, scoped and auditable; historical enrollments remain
-- reserved so a disabled provider phone cannot fall through as a client reply.
CREATE TABLE IF NOT EXISTS provider_sms_relay_enrollments (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 agency_id INT NOT NULL, provider_user_id INT NOT NULL, number_id INT NOT NULL,
 phone VARCHAR(32) NOT NULL, enabled BOOLEAN NOT NULL DEFAULT FALSE,
 consent_actor_id INT NOT NULL, consent_at DATETIME(6) NOT NULL,
 consent_source VARCHAR(40) NOT NULL, disclosure_version VARCHAR(40) NOT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 UNIQUE KEY relay_phone_owner (number_id, phone),
 KEY relay_provider (agency_id, provider_user_id, enabled)
);
CREATE TABLE IF NOT EXISTS provider_sms_relay_routes (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 enrollment_id BIGINT UNSIGNED NOT NULL, client_id INT NOT NULL,
 guardian_user_id INT NOT NULL DEFAULT 0, family_phone VARCHAR(32) NOT NULL,
 reply_code VARCHAR(100) NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY relay_recipient (enrollment_id, client_id, guardian_user_id, family_phone),
 UNIQUE KEY relay_code (enrollment_id, reply_code)
);
CREATE TABLE IF NOT EXISTS provider_sms_relay_dispatches (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 enrollment_id BIGINT UNSIGNED NOT NULL, carrier_message_id VARCHAR(191) NOT NULL,
 inbound_log_id INT NULL, outbound_log_id INT NULL,
 status VARCHAR(30) NOT NULL DEFAULT 'pending', created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY relay_dispatch_once (enrollment_id, carrier_message_id)
);
CREATE TABLE IF NOT EXISTS provider_sms_relay_replies (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 number_id INT NOT NULL, carrier_message_id VARCHAR(191) NOT NULL,
 enrollment_id BIGINT UNSIGNED NOT NULL, outbound_log_id INT NULL,
 status VARCHAR(30) NOT NULL DEFAULT 'pending', created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY relay_reply_once (number_id, carrier_message_id)
);
