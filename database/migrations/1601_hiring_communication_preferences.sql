-- Hiring consent is separate from staff texting and never enables client forwarding.
CREATE TABLE IF NOT EXISTS hire_communication_preferences (
 user_id INT NOT NULL, agency_id INT NOT NULL,
 channel VARCHAR(20) NOT NULL DEFAULT 'email', phone VARCHAR(32) NULL,
 consent_request_id BIGINT UNSIGNED NULL, reviewed_at DATETIME NULL,
 observed_snapshot JSON NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 PRIMARY KEY(user_id,agency_id)
);
CREATE TABLE IF NOT EXISTS hire_notification_events (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, user_id INT NOT NULL, agency_id INT NOT NULL,
 event_key VARCHAR(180) NOT NULL, event_type VARCHAR(40) NOT NULL,
 email_status VARCHAR(20) NOT NULL DEFAULT 'pending', sms_status VARCHAR(20) NOT NULL DEFAULT 'pending',
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, UNIQUE KEY hire_event(user_id,agency_id,event_key)
);
